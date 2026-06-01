/**
 * One-time: merge General Help + Bug Report ticket categories into one.
 * Updates saved guild config + blueprint, then refreshes the panel in Discord.
 *
 * Usage:
 *   node scripts/mergeTicketCategories.js YOUR_GUILD_ID
 *
 * Requires DISCORD_TOKEN in .env (same as the bot).
 */
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const guildId = process.argv[2];
if (!guildId) {
  console.error("Usage: node scripts/mergeTicketCategories.js <GUILD_ID>");
  console.error("Tip: Enable Developer Mode in Discord → right-click server → Copy Server ID");
  process.exit(1);
}

/** Merged categories — help + bug are now one option */
export const MERGED_TICKET_CATEGORIES = [
  {
    id: "support",
    label: "Support & Bugs",
    description: "Help, billing questions, or report a bug (include steps to reproduce)",
    emoji: "🛟"
  },
  {
    id: "billing",
    label: "Billing",
    description: "Purchases, Basic Pack, or Pro subscription",
    emoji: "💳"
  },
  {
    id: "feature",
    label: "Feature Request",
    description: "Suggest improvements for JustTheBuilder",
    emoji: "✨"
  }
];

function patchJsonFile(filePath, patchTickets) {
  if (!fs.existsSync(filePath)) return false;
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const staffRoles = data.tickets?.staffRoles || ["Support Agent", "Founder", "Admin", "Moderator"];
  data.tickets = {
    enabled: true,
    panelChannel: data.tickets?.panelChannel || "create-ticket",
    categories: MERGED_TICKET_CATEGORIES,
    staffRoles
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Updated ${filePath}`);
  return true;
}

async function main() {
  const guildsDir = path.resolve("data", "guilds");
  const bpPath = path.resolve("data", "blueprints", `${guildId}.json`);
  const guildCfgPath = path.join(guildsDir, `${guildId}.json`);

  patchJsonFile(bpPath, true);
  patchJsonFile(guildCfgPath, true);

  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) {
    console.log("No DISCORD_TOKEN — files updated only. Run /setup ticket-panel in Discord after deploy.");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);

  const guild = await client.guilds.fetch(guildId);
  const { saveTicketConfig } = await import("../src/utils/tickets/config.js");
  const { deployTicketPanelForGuild } = await import("../src/utils/tickets/handler.js");

  const config = {
    enabled: true,
    panelChannel: "create-ticket",
    categories: MERGED_TICKET_CATEGORIES,
    staffRoles: ["Support Agent", "Founder"]
  };

  saveTicketConfig(guildId, config, null);
  const ok = await deployTicketPanelForGuild(guild, client, config);

  console.log(ok ? "✅ Ticket panel refreshed in Discord." : "❌ Could not find #create-ticket — check channel name.");

  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
