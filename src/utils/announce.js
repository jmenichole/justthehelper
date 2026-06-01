import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { log } from "./logger.js";

/**
 * Slash command definition for /announce (bot-owner only).
 * Used to send an introduction message to all guilds the bot is in.
 */
export const AnnounceCommandData = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("📣 [Bot Owner] Send an intro message to all servers JustTheBuilder is in.")
  .addStringOption(opt =>
    opt.setName("custom_message")
      .setDescription("Optional extra line to include in the announcement.")
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

/**
 * Find the best channel to announce in for a given guild.
 * Priority: #general → #announcements → #welcome → first sendable text channel.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Client} client
 * @returns {Promise<import('discord.js').TextChannel|null>}
 */
async function findAnnounceChannel(guild, client) {
  const preferred = ["general", "announcements", "welcome", "lobby", "chat", "main"];

  // Check by name first
  for (const name of preferred) {
    const ch = guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase().includes(name)
    );
    if (ch && ch.permissionsFor(guild.members.me)?.has("SendMessages")) return ch;
  }

  // Fall back to any sendable text channel
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildText &&
         ch?.permissionsFor?.(guild.members.me)?.has("SendMessages")
  ) || null;
}

/**
 * Build the announcement embed.
 * @param {string} [customMessage]
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildAnnounceEmbed(customMessage) {
  const supportInvite = process.env.SUPPORT_SERVER_INVITE || "https://discord.gg/justthebuilder";

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle("👋 Hey! JustTheBuilder is now live.")
    .setDescription(
      [
        "Hi there! We noticed **JustTheBuilder** has been in your server for a while — thanks for the invite! 🙌",
        "",
        "The bot is now fully online and ready to automate your entire Discord server setup:",
        "✅ AI-generated channels, roles & permissions",
        "✅ Auto-written rules, FAQ & welcome messages",
        "✅ Multiple themes & style presets",
        "✅ Export, import & reapply your server blueprint anytime",
        "",
        "🎁 **Early Supporter Gift:** As a thank-you for having us installed, we have credited this server with **one completely free full AI server setup**.",
        "",
        "**Get started:** Run `/setup run` in your server (must be server owner).",
        "",
        customMessage ? `📢 ${customMessage}\n` : "",
        `💬 **Need help or have questions?** Join our support server: ${supportInvite}`,
        "",
        "_One-time setup pack available for $3.99 · Unlimited plan at $6.99/mo — check our bot profile._"
      ].filter(line => line !== undefined).join("\n")
    )
    .setFooter({ text: "JustTheBuilder • AI-Powered Discord Server Setup" })
    .setTimestamp();
}

/**
 * Handle /announce command — bot-owner-only broadcast to all guilds.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleAnnounceInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "announce") return;

  // Gate: bot owner only (set BOT_OWNER_ID in env)
  const ownerId = process.env.BOT_OWNER_ID;
  if (!ownerId || interaction.user.id !== ownerId) {
    return interaction.reply({
      ephemeral: true,
      content: "❌ This command is restricted to the bot owner."
    });
  }

  await interaction.reply({
    ephemeral: true,
    content: `📣 Starting broadcast to ${client.guilds.cache.size} servers...`
  });

  const customMessage = interaction.options.getString("custom_message") || null;
  const embed = buildAnnounceEmbed(customMessage);

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      // Refresh member cache so permissionsFor works
      await guild.members.fetchMe().catch(() => {});
      const channel = await findAnnounceChannel(guild, client);
      if (!channel) {
        skipped++;
        log(`Announce: no suitable channel in ${guild.name} (${guildId})`);
        continue;
      }
      await channel.send({ embeds: [embed] });
      sent++;
      log(`Announce: sent to ${guild.name} → #${channel.name}`);
    } catch (err) {
      skipped++;
      errors.push(`${guild.name}: ${err.message}`);
      log(`Announce error in ${guild.name}: ${err.message}`);
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 400));
  }

  const summary = [
    `✅ **Broadcast complete!**`,
    `📨 Sent: **${sent}** servers`,
    `⏭️ Skipped (no channel / no permission): **${skipped}** servers`,
    errors.length ? `\n⚠️ Errors:\n${errors.slice(0, 5).join("\n")}` : ""
  ].join("\n");

  await interaction.followUp({ ephemeral: true, content: summary });
}
