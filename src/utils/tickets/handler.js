import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";
import fs from "fs";
import path from "path";
import { log } from "../logger.js";
import { canOpenSupportTicket, isBotOwner } from "../entitlements.js";

const OPEN_ID = "jtb_ticket_open";
const CLOSE_ID = "jtb_ticket_close";

const TICKET_PANEL_BODY =
  "Need assistance with **billing**, **subscriptions**, or **custom configurations**?\n\n" +
  "Our team is here to help!\n\n" +
  "**Pro Builder** subscribers can open a private support ticket below.\n" +
  "*(Bot owner & staff — always free.)*";

function ticketsPath(guildId) {
  const dir = path.resolve("data", "tickets");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${guildId}.json`);
}

function loadTicketState(guildId) {
  const p = ticketsPath(guildId);
  if (!fs.existsSync(p)) return { counter: 0, open: {} };
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { counter: 0, open: {} };
  }
}

function saveTicketState(guildId, state) {
  fs.writeFileSync(ticketsPath(guildId), JSON.stringify(state, null, 2));
}

function staffRoleIds(guild) {
  return guild.roles.cache
    .filter((r) => /admin|mod|staff|support|founder/i.test(r.name) && !r.managed)
    .map((r) => r.id);
}

function sanitizeTicketSlug(user) {
  const base = (user.username || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 20);
  return base || "user";
}

export function buildTicketPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🎟️ Open a Support Ticket")
    .setDescription(TICKET_PANEL_BODY);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPEN_ID)
      .setLabel("Open Support Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎟️")
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Post ticket panel if not already present (avoids duplicates on rebuild).
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').Client} client
 */
export async function ensureTicketPanel(channel, client) {
  if (!channel?.isTextBased?.()) return null;
  try {
    const recent = await channel.messages.fetch({ limit: 20 });
    const existing = recent.find(
      (m) =>
        m.author.id === client.user.id &&
        m.components?.some((row) =>
          row.components?.some((c) => c.customId === OPEN_ID)
        )
    );
    if (existing) return existing;
    return channel.send(buildTicketPanelPayload());
  } catch (err) {
    log(`Ticket panel failed in #${channel.name}: ${err.message}`);
    return null;
  }
}

async function findTicketParent(guild, nearChannel) {
  if (nearChannel?.parent) return nearChannel.parent;
  const cat = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      /support|ticket|client/i.test(c.name)
  );
  return cat || null;
}

async function createTicketChannel(guild, member, nearChannel) {
  const state = loadTicketState(guild.id);
  if (state.open[member.id]) {
    const existingId = state.open[member.id];
    const existing = guild.channels.cache.get(existingId);
    if (existing) return { channel: existing, alreadyOpen: true };
    delete state.open[member.id];
  }

  state.counter += 1;
  const num = String(state.counter).padStart(4, "0");
  const slug = sanitizeTicketSlug(member.user);
  const parent = await findTicketParent(guild, nearChannel);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  for (const roleId of staffRoleIds(guild)) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${num}-${slug}`,
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic: `Support ticket for ${member.user.tag} — Pro Builder`,
    permissionOverwrites: overwrites,
    reason: `Support ticket #${num} for ${member.user.tag}`
  });

  state.open[member.id] = channel.id;
  saveTicketState(guild.id, state);

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_ID)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  const intro = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🎟️ Ticket #${num}`)
    .setDescription(
      [
        `**Opened by:** ${member}`,
        "",
        "Please describe your issue (**billing**, **subscription**, or **setup help**) in detail.",
        "Staff will respond as soon as possible.",
        "",
        isBotOwner(member.id)
          ? "_Owner bypass — priority support._"
          : "_Pro Builder support ticket._"
      ].join("\n")
    )
    .setFooter({ text: "JustTheBuilder Support" });

  await channel.send({
    content: `${member} — staff will be with you shortly.`,
    embeds: [intro],
    components: [closeRow]
  });

  return { channel, alreadyOpen: false, num };
}

async function closeTicketChannel(channel, interaction) {
  const guild = channel.guild;
  const state = loadTicketState(guild.id);
  const entry = Object.entries(state.open).find(([, id]) => id === channel.id);
  if (entry) delete state.open[entry[0]];
  saveTicketState(guild.id, state);

  const isStaff =
    isBotOwner(interaction.user.id) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    staffRoleIds(guild).some((id) => interaction.member?.roles?.cache?.has(id));

  const isOpener = entry && entry[0] === interaction.user.id;

  if (!isStaff && !isOpener) {
    return interaction.reply({
      ephemeral: true,
      content: "Only the ticket opener or staff can close this ticket."
    });
  }

  await interaction.reply({ ephemeral: true, content: "🔒 Closing ticket in 3 seconds…" });
  setTimeout(async () => {
    try {
      await channel.delete("Support ticket closed");
    } catch (err) {
      log(`Ticket close delete failed: ${err.message}`);
    }
  }, 3000);
}

/**
 * Handle ticket button interactions.
 */
export async function handleTicketInteraction(interaction, client) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== OPEN_ID && interaction.customId !== CLOSE_ID) return false;

  if (interaction.customId === OPEN_ID) {
    const access = await canOpenSupportTicket(
      client,
      interaction.user.id,
      interaction.entitlements
    );
    if (!access.allowed) {
      await interaction.reply({
        ephemeral: true,
        content: [
          "💎 **Pro Builder subscription required** to open support tickets.",
          "",
          "Subscribe to **Pro Builder** ($6.99/mo) on the bot profile to unlock:",
          "• Unlimited server builds",
          "• **Private support tickets** (billing & setup help)",
          "• Post-build embed edits",
          "",
          "Basic Build Pack does not include support tickets."
        ].join("\n")
      });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const near = interaction.channel;
      const { channel, alreadyOpen, num } = await createTicketChannel(
        interaction.guild,
        interaction.member,
        near
      );
      if (alreadyOpen) {
        await interaction.editReply({
          content: `You already have an open ticket: ${channel}`
        });
      } else {
        await interaction.editReply({
          content: `✅ Ticket **#${num}** created: ${channel}`
        });
      }
    } catch (err) {
      log(`Create ticket failed: ${err.message}`);
      await interaction.editReply({
        content: `❌ Could not create ticket: ${err.message}`
      });
    }
    return true;
  }

  if (interaction.customId === CLOSE_ID) {
    await closeTicketChannel(interaction.channel, interaction);
    return true;
  }

  return false;
}

/**
 * Find #create-ticket (or similar) and refresh panel.
 */
export async function deployTicketPanelInGuild(guild, client) {
  const channel = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (/create-ticket|open-ticket|support-ticket/i.test(c.name) ||
        c.name.includes("ticket"))
  );
  if (!channel) return false;
  await ensureTicketPanel(channel, client);
  return true;
}
