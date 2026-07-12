import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { handleGuildCreate } from "./events/guildCreate.js";
import { log } from "./logger.js";

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

  const { initOps } = await import("./ops.js");
  initOps(client);

  const { startHealthServer } = await import("./health.js");
  startHealthServer(client);

  const { startReminderScanner } = await import("./reminders/scanner.js");
  startReminderScanner(client);

  try {
    const { WelcomeCommandData } = await import("./commands/welcome.js");
    const { TicketsCommandData } = await import("./commands/tickets.js");
    const { RemindCommandData } = await import("./commands/remind.js");
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

client.on("interactionCreate", async (i) => {
  try {
    const { handleWelcomeCommand } = await import("./commands/welcome.js");
    if (await handleWelcomeCommand(i, client)) return;
    const { handleTicketsCommand } = await import("./commands/tickets.js");
    if (await handleTicketsCommand(i, client)) return;
    const { handleRemindCommand } = await import("./commands/remind.js");
    if (await handleRemindCommand(i)) return;
    const { handleVerifyButton } = await import("./welcome/handler.js");
    if (await handleVerifyButton(i, client)) return;
    const { handleTicketInteraction } = await import("./tickets/handler.js");
    if (await handleTicketInteraction(i, client)) return;
  } catch (err) {
    log(`Interaction error: ${err.message}`);
    const { postError } = await import("./ops.js");
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
    const { postError } = await import("./ops.js");
    postError({ context: "uncaughtException", message: err.message, stack: err.stack });
  } catch {}
});

process.on("unhandledRejection", async (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error("unhandledRejection:", reason);
  try {
    const { postError } = await import("./ops.js");
    postError({ context: "unhandledRejection", message, stack });
  } catch {}
});

client.on("entitlementCreate", async (entitlement) => {
  log(`New entitlement: SKU ${entitlement.skuId} for user ${entitlement.userId}`);
  try {
    const { postPurchase } = await import("./ops.js");
    const helperSkus = [process.env.HELPER_SKU_ID, process.env.SUBSCRIPTION_SKU_ID].filter(Boolean);
    const skuLabel = helperSkus.includes(entitlement.skuId)
      ? "JustTheHelper $1.99/mo"
      : String(entitlement.skuId);
    postPurchase({ userId: entitlement.userId, skuId: entitlement.skuId, skuLabel });
  } catch {}
});

client.login(process.env.DISCORD_TOKEN);
