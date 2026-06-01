import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { handleGuildCreate } from "./events/guildCreate.js";
import { SetupCommandData, handleSetupInteraction } from "./commands/setup.js";
import { handleOnboardingComponent, handlePostBuildButtons } from "./onboarding/flow.js";
import { log } from "./logger.js";

// Try multiple env locations (root .env first, then src/config/.env)
const envCandidates = [".env", "src/config/.env"];
for (const p of envCandidates) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) { log(`Loaded environment from ${p}`); break; }
  } catch {}
}

// Validate essential environment variables early with helpful hints
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
  if (!process.env.GROQ_API_KEY) {
    log("Warning: GROQ_API_KEY not set; AI calls will fail. Get a free key at https://console.groq.com");
  }
}
assertEnv();

// Minimal intents: remove privileged (GuildMembers, MessageContent) to avoid gateway rejection.
// DM interview works without MessageContent because DM message content is accessible.
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

  // Initialize early adopters list on first boot
  const dataDir = path.resolve("data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const earlyAdoptersPath = path.join(dataDir, "early_adopters.json");
  if (!fs.existsSync(earlyAdoptersPath)) {
    const guildIds = client.guilds.cache.map(g => g.id);
    fs.writeFileSync(earlyAdoptersPath, JSON.stringify(guildIds, null, 2));
    log(`Saved ${guildIds.length} early adopter guilds to ${earlyAdoptersPath}`);
  }

  // Start health server so Railway can confirm the bot is alive
  const { startHealthServer } = await import("./health.js");
  startHealthServer(client);

  // Register slash commands globally
  try {
    const { AnnounceCommandData } = await import("./announce.js");
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [SetupCommandData, AnnounceCommandData]
    });
    log("Registered /setup and /announce commands");
  } catch (err) {
    log(`Command registration failed: ${err.message}`);
  }
});

client.on("guildCreate", (guild) => handleGuildCreate(guild, client));

client.on("interactionCreate", async (i) => {
  const { handleTicketInteraction } = await import("./tickets/handler.js");
  if (await handleTicketInteraction(i, client)) return;

  const { handleAnnounceInteraction } = await import("./announce.js");
  handleSetupInteraction(i, client);
  handleOnboardingComponent(i, client);
  handlePostBuildButtons(i, client);
  handleAnnounceInteraction(i, client);
});

// DM buyers immediately when a new purchase comes in while the bot is online
client.on("entitlementCreate", async (entitlement) => {
  log(`New entitlement: SKU ${entitlement.skuId} for user ${entitlement.userId}`);
  const basicPackId = process.env.PREMIUM_SKU_ID;
  const subId = process.env.SUBSCRIPTION_SKU_ID;
  const supportLink = process.env.SUPPORT_SERVER_INVITE || "https://discord.gg/NEePze3rZd";

  let message = "";
  if (entitlement.skuId === basicPackId) {
    message = [
      "🎉 **Thanks for grabbing the Basic Build Pack!**",
      "",
      "Your pack is ready to use. Here's how to start:",
      "1. Go to any Discord server **you own**",
      "2. Run `/setup run`",
      "3. The bot will DM you a quick interview to customize your server",
      "4. Sit back — your server will be built in under a minute ⚡",
      "",
      "Your pack covers **one complete server build** (channels, roles, permissions, rules, FAQ, and more).",
      "",
      `Need help? Join our support server: ${supportLink}`
    ].join("\n");
  } else if (entitlement.skuId === subId) {
    message = [
      "💎 **You're a Pro Builder subscriber — thank you!**",
      "",
      "Here's everything that's unlocked for you:",
      "✅ `/setup run` — unlimited server builds, any time",
      "✅ `/setup run preset:gaming` — fast-track preset templates (Gaming, Crypto, Content & more)",
      "✅ `/setup edit-message` — edit bot messages & embeds after your server is built",
      "✅ **Private support tickets** in our support server (#create-ticket)",
      "",
      "**To get started:** Go to any server you own and run `/setup run`.",
      "The bot will DM you to customize your build.",
      "",
      `Need help? Join our support server: ${supportLink}`
    ].join("\n");
  } else {
    message = `🎉 Thanks for your purchase! Run \`/setup run\` in any server you own to get started.\n\nSupport: ${supportLink}`;
  }

  try {
    const user = await client.users.fetch(entitlement.userId);
    await user.send(message);
    log(`Entitlement DM sent to ${entitlement.userId}`);
  } catch (err) {
    log(`Failed to DM entitlement holder ${entitlement.userId}: ${err.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
