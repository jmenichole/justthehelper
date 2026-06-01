// Owner-only broadcast (/announce). Gated by BOT_OWNER_ID in handleAnnounceInteraction.
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";
import { log } from "./logger.js";

export const AnnounceCommandData = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("📣 [Bot Owner] Broadcast to all servers that installed the bot")
  .addStringOption((opt) =>
    opt
      .setName("template")
      .setDescription("Message template to send")
      .setRequired(true)
      .addChoices(
        { name: "We're back (apology — was unhosted)", value: "apology" },
        { name: "Now live (intro + early adopter gift)", value: "intro" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("target")
      .setDescription("Where to send")
      .setRequired(true)
      .addChoices(
        { name: "DM each server owner", value: "dm" },
        { name: "Post in each server (#general etc.)", value: "channel" },
        { name: "Both DM owners + server channel", value: "both" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("custom_message")
      .setDescription("Optional extra paragraph appended to the message")
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

function supportLink() {
  return process.env.SUPPORT_SERVER_INVITE || "https://discord.gg/NEePze3rZd";
}

function buildIntroEmbed(customMessage) {
  const invite = supportLink();
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("👋 Hey! JustTheBuilder is now live.")
    .setDescription(
      [
        "Hi there! **JustTheBuilder** is in your server — thanks for the invite! 🙌",
        "",
        "The bot is **hosted and online**, ready to automate your Discord setup:",
        "✅ AI-generated channels, roles & permissions",
        "✅ Auto-written rules, FAQ & welcome embeds",
        "✅ Built-in support tickets (categories + staff pings)",
        "✅ Fast-track presets on Pro",
        "",
        "🎁 **Early install gift:** This server still has **one free full AI setup**. Run `/setup run` (server owner).",
        "",
        customMessage ? `📢 ${customMessage}\n` : "",
        `💬 **Questions?** ${invite}`,
        "",
        "_Basic Build Pack $3.99 · Pro Builder $6.99/mo — see the bot profile._"
      ]
        .filter((line) => line !== undefined)
        .join("\n")
    )
    .setFooter({ text: "JustTheBuilder" })
    .setTimestamp();
}

function buildApologyEmbed(customMessage) {
  const invite = supportLink();
  return new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("🙏 We're back — sorry for the quiet period")
    .setDescription(
      [
        "If you installed **JustTheBuilder** a while ago, you deserve a straight answer.",
        "",
        "**What happened:** This started as a **side project** and went through a stretch **without proper hosting** — the bot may have felt offline, broken, or abandoned. That's **my bad**, not yours.",
        "",
        "**Where things stand now:** JustTheBuilder is **hosted, maintained, and live again** — full server builds, embeds, ticket system, and ongoing updates.",
        "",
        "🎁 **Still with us?** Early servers keep **one free full `/setup run`** (owner only). Try:",
        "• `/setup run` — custom AI interview",
        "• `/setup run preset:justthebuilder` — official support layout",
        "",
        "If it's not for you anymore, you can kick the bot — no hard feelings. If you stay, we'd love your feedback in our support server.",
        "",
        customMessage ? `📢 **Note from the builder:** ${customMessage}\n` : "",
        `💬 **Support & updates:** ${invite}`
      ]
        .filter((line) => line !== undefined)
        .join("\n")
    )
    .setFooter({ text: "JustTheBuilder — thanks for your patience" })
    .setTimestamp();
}

function buildEmbed(template, customMessage) {
  return template === "apology"
    ? buildApologyEmbed(customMessage)
    : buildIntroEmbed(customMessage);
}

async function findAnnounceChannel(guild) {
  const preferred = ["general", "announcements", "welcome", "lobby", "chat", "main", "bot"];

  for (const name of preferred) {
    const ch = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes(name)
    );
    if (ch?.permissionsFor(guild.members.me)?.has("SendMessages")) return ch;
  }

  return (
    guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildText &&
        c.permissionsFor(guild.members.me)?.has("SendMessages")
    ) || null
  );
}

async function sendToChannel(guild, embed) {
  await guild.members.fetchMe().catch(() => {});
  const channel = findAnnounceChannel(guild);
  if (!channel) return { ok: false, reason: "no_channel" };
  await channel.send({ embeds: [embed] });
  return { ok: true, channel: channel.name };
}

async function sendToOwner(guild, embed) {
  const owner = await guild.fetchOwner();
  await owner.send({ embeds: [embed] });
  return { ok: true, tag: owner.user.tag };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function handleAnnounceInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "announce") return;

  const ownerId = process.env.BOT_OWNER_ID;
  if (!ownerId || interaction.user.id !== ownerId) {
    return interaction.reply({
      ephemeral: true,
      content: "❌ This command is restricted to the bot owner (`BOT_OWNER_ID`)."
    });
  }

  const template = interaction.options.getString("template");
  const target = interaction.options.getString("target");
  const customMessage = interaction.options.getString("custom_message");
  const embed = buildEmbed(template, customMessage);

  const guilds = [...client.guilds.cache.values()];
  await interaction.reply({
    ephemeral: true,
    content: [
      `📣 **Broadcast starting**`,
      `• Servers: **${guilds.length}**`,
      `• Template: **${template}**`,
      `• Target: **${target}**`,
      "",
      "_This may take several minutes (rate limits)._"
    ].join("\n")
  });

  let channelSent = 0;
  let channelSkipped = 0;
  let dmSent = 0;
  let dmSkipped = 0;
  const errors = [];

  for (const guild of guilds) {
    const label = `${guild.name} (${guild.id})`;

    if (target === "channel" || target === "both") {
      try {
        const res = await sendToChannel(guild, embed);
        if (res.ok) {
          channelSent++;
          log(`Announce channel → ${label} #${res.channel}`);
        } else {
          channelSkipped++;
        }
      } catch (err) {
        channelSkipped++;
        errors.push(`# ${guild.name}: ${err.message}`);
        log(`Announce channel fail ${label}: ${err.message}`);
      }
      await delay(450);
    }

    if (target === "dm" || target === "both") {
      try {
        const res = await sendToOwner(guild, embed);
        if (res.ok) {
          dmSent++;
          log(`Announce DM → ${res.tag} (${label})`);
        }
      } catch (err) {
        dmSkipped++;
        errors.push(`DM ${guild.name}: ${err.message}`);
        log(`Announce DM fail ${label}: ${err.message}`);
      }
      await delay(1200);
    }
  }

  const lines = [
    "✅ **Broadcast finished**",
    target === "dm" || target === "both"
      ? `📬 Owner DMs sent: **${dmSent}** · failed/skipped: **${dmSkipped}**`
      : null,
    target === "channel" || target === "both"
      ? `📨 Server posts: **${channelSent}** · skipped: **${channelSkipped}**`
      : null,
    errors.length ? `\n⚠️ First issues:\n${errors.slice(0, 8).join("\n")}` : ""
  ].filter(Boolean);

  await interaction.followUp({ ephemeral: true, content: lines.join("\n") });
}
