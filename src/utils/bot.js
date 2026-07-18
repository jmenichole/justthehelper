import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { handleGuildCreate } from "./events/guildCreate.js";
import { log } from "./logger.js";
import { WelcomeCommandData, handleWelcomeCommand } from "./commands/welcome.js";
import { TicketsCommandData, handleTicketsCommand } from "./commands/tickets.js";
import { RemindCommandData, handleRemindCommand } from "./commands/remind.js";
import { handleVerifyButton } from "./welcome/handler.js";
import { handleTicketInteraction } from "./tickets/handler.js";
import { initOps, postError, postPurchase } from "./ops.js";
import { startHealthServer } from "./health.js";
import { startReminderScanner } from "./reminders/scanner.js";

// Try multiple env locations (root .env first, then src/config/.env)
const envCandidates = [".env", "src/config/.env"];
for (const p of envCandidates) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) { log(`Loaded environment from ${p}`); break; }
  } catch {}
}

function assertEnv() {
  let token = process.env.DISCORD_TOKEN;
  if (token) token = token.trim();
  if (!token || token.length < 10) {
    console.error("[FATAL] DISCORD_TOKEN missing or too short.\n" +
      "Place your token in project root .env (preferred) or src/config/.env\n" +
      "Example:\nDISCORD_TOKEN=YOUR_BOT_TOKEN\n" +
      "Portal: https://discord.com/developers/applications -> Bot -> Bot -> Reset Token");
    console.error("Current working directory:", process.cwd());
    process.exit(1);
  }
  const masked = token.slice(0, 6) + "..." + token.slice(-4);
  log(`Token loaded (masked): ${masked}`);

  const helperSku = (process.env.HELPER_SKU_ID || process.env.SUBSCRIPTION_SKU_ID || "").trim();
  if (!helperSku) {
    log("[WARN] HELPER_SKU_ID is not set — paid ticket unlocks will be denied until configured.");
  }
}
assertEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.once("clientReady", async () => {
  log(`Ready as ${client.user.tag} | Guilds: ${client.guilds.cache.size}`);

  initOps(client);
  startHealthServer(client);
  startReminderScanner(client);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [WelcomeCommandData, TicketsCommandData, RemindCommandData],
    });
    log("Registered /welcome /tickets /remind");
  } catch (err) {
    log(`Command registration failed: ${err.message}`);
  }
});

client.on("guildCreate", (guild) => handleGuildCreate(guild, client));

client.on("guildDelete", (guild) => {
  log(`Bot removed from server: ${guild.name} (${guild.id})`);
});

function isStaleInteractionError(err) {
  const code = err?.code ?? err?.rawError?.code;
  return code === 10062 || code === 40060;
}

client.on("interactionCreate", async (i) => {
  try {
    if (await handleWelcomeCommand(i, client)) return;
    if (await handleTicketsCommand(i, client)) return;
    if (await handleRemindCommand(i)) return;
    if (await handleVerifyButton(i, client)) return;
    if (await handleTicketInteraction(i, client)) return;
  } catch (err) {
    if (isStaleInteractionError(err)) {
      log(`Stale interaction ignored: ${err.message}`);
      return;
    }
    log(`Interaction error: ${err.message}`);
    postError({
      context: `interaction:${i.commandName || i.customId || "unknown"}`,
      message: err.message || String(err),
      stack: err.stack,
    });
    if (i.isRepliable?.() && !i.replied && !i.deferred) {
      await i.reply({ ephemeral: true, content: "❌ Something went wrong. Try again." }).catch(() => {});
    }
  }
});

process.on("uncaughtException", async (err) => {
  console.error("uncaughtException:", err);
  try {
    postError({ context: "uncaughtException", message: err.message, stack: err.stack });
  } catch {}
});

process.on("unhandledRejection", async (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error("unhandledRejection:", reason);
  try {
    postError({ context: "unhandledRejection", message, stack });
  } catch {}
});

client.on("entitlementCreate", async (entitlement) => {
  log(
    `New entitlement: SKU ${entitlement.skuId} for user ${entitlement.userId}` +
      (entitlement.guildId ? ` guild ${entitlement.guildId}` : "")
  );
  try {
    const helperSkus = [process.env.HELPER_SKU_ID, process.env.SUBSCRIPTION_SKU_ID].filter(Boolean);
    const skuLabel = helperSkus.includes(entitlement.skuId)
      ? "JustTheHelper $1.99/mo"
      : String(entitlement.skuId);
    postPurchase({
      userId: entitlement.userId,
      skuId: entitlement.skuId,
      skuLabel,
      guildId: entitlement.guildId,
    });
  } catch {}
});

client.login(process.env.DISCORD_TOKEN);
