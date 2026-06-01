import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} from "discord.js";
import fs from "fs";
import path from "path";
import { log } from "../logger.js";
import { getTicketConfig } from "./config.js";

const SELECT_ID = "jtb_ticket_category";
const CLOSE_ID = "jtb_ticket_close";

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

function resolveStaffRoleIds(guild, staffRoleNames = []) {
  const ids = new Set();
  for (const name of staffRoleNames) {
    const role = guild.roles.cache.find(
      (r) =>
        !r.managed &&
        (r.name.toLowerCase() === name.toLowerCase() ||
          r.name.toLowerCase().includes(name.toLowerCase()))
    );
    if (role) ids.add(role.id);
  }
  if (!ids.size) {
    guild.roles.cache.forEach((r) => {
      if (!r.managed && /admin|mod|staff|support|founder/i.test(r.name)) ids.add(r.id);
    });
  }
  return [...ids];
}

function staffMentionLine(guild, staffRoleNames) {
  const ids = resolveStaffRoleIds(guild, staffRoleNames);
  if (!ids.length) return "";
  return ids.map((id) => `<@&${id}>`).join(" ");
}

function sanitizeSlug(user) {
  return (
    (user.username || "user")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 16) || "user"
  );
}

function findCategory(config, categoryId) {
  return config.categories?.find((c) => c.id === categoryId);
}

export function buildTicketPanelPayload(config) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎟️ Support Tickets")
    .setDescription(
      [
        "Need help? **Anyone** can open a private ticket.",
        "",
        "**Choose a category** below — staff will be notified automatically.",
        "",
        config.categories?.map((c) => `${c.emoji || "•"} **${c.label}** — ${c.description || ""}`).join("\n") ||
          "Select a category to begin."
      ].join("\n")
    )
    .setFooter({ text: "JustTheBuilder Ticket System" });

  const options = (config.categories || []).slice(0, 25).map((c) => ({
    label: c.label.slice(0, 100),
    value: c.id,
    description: (c.description || c.label).slice(0, 100),
    emoji: c.emoji || undefined
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SELECT_ID)
      .setPlaceholder("Select a ticket category…")
      .addOptions(options.length ? options : [{ label: "General Help", value: "general" }])
  );

  return { embeds: [embed], components: [row] };
}

function findPanelChannel(guild, panelChannelName) {
  const slug = (panelChannelName || "create-ticket").toLowerCase();
  return guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      (c.name === slug || c.name.includes(slug) || /create-ticket|open-ticket|support-ticket/i.test(c.name))
  );
}

/**
 * Post or refresh ticket panel in the configured channel.
 */
export async function ensureTicketPanel(channel, client, config, { forceNew = false } = {}) {
  if (!channel?.isTextBased?.() || !config?.enabled) return null;
  try {
    if (!forceNew) {
      const recent = await channel.messages.fetch({ limit: 25 });
      const existing = recent.find(
        (m) =>
          m.author.id === client.user.id &&
          m.components?.some((row) =>
            row.components?.some((c) => c.customId === SELECT_ID)
          )
      );
      if (existing) {
        await existing.edit(buildTicketPanelPayload(config));
        return existing;
      }
    }
    return channel.send(buildTicketPanelPayload(config));
  } catch (err) {
    log(`Ticket panel failed: ${err.message}`);
    return null;
  }
}

export async function deployTicketPanelForGuild(guild, client, config, { forceNew = false } = {}) {
  if (!config?.enabled) return false;
  const channel = findPanelChannel(guild, config.panelChannel);
  if (!channel) return false;
  await ensureTicketPanel(channel, client, config, { forceNew });
  return true;
}

async function findTicketParent(guild, nearChannel) {
  if (nearChannel?.parent) return nearChannel.parent;
  return (
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && /support|ticket|help|client/i.test(c.name)
    ) || null
  );
}

async function createTicketChannel(guild, member, nearChannel, config, categoryId) {
  const category = findCategory(config, categoryId) || {
    id: categoryId,
    label: categoryId,
    description: ""
  };

  const state = loadTicketState(guild.id);
  const openKey = `${member.id}:${category.id}`;
  if (state.open[openKey]) {
    const existing = guild.channels.cache.get(state.open[openKey]);
    if (existing) return { channel: existing, alreadyOpen: true, category };
    delete state.open[openKey];
  }

  state.counter += 1;
  const num = String(state.counter).padStart(4, "0");
  const slug = sanitizeSlug(member.user);
  const parent = await findTicketParent(guild, nearChannel);
  const staffIds = resolveStaffRoleIds(guild, config.staffRoles);

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

  for (const roleId of staffIds) {
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

  const channelName = `ticket-${category.id}-${num}-${slug}`.slice(0, 100);
  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic: `[${category.label}] Ticket #${num} — ${member.user.tag}`,
    permissionOverwrites: overwrites,
    reason: `Ticket ${num} (${category.label}) for ${member.user.tag}`
  });

  state.open[openKey] = ticketChannel.id;
  saveTicketState(guild.id, state);

  const pings = staffMentionLine(guild, config.staffRoles);
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CLOSE_ID).setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
  );

  const intro = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${category.emoji || "🎟️"} ${category.label} — Ticket #${num}`)
    .setDescription(
      [
        `**Opened by:** ${member}`,
        `**Category:** ${category.label}`,
        category.description ? `**About:** ${category.description}` : "",
        "",
        "Describe your issue in detail. Staff have been notified."
      ]
        .filter(Boolean)
        .join("\n")
    );

  await ticketChannel.send({
    content: [pings, `${member}`].filter(Boolean).join("\n"),
    embeds: [intro],
    components: [closeRow]
  });

  return { channel: ticketChannel, alreadyOpen: false, category, num };
}

async function closeTicketChannel(channel, interaction) {
  const guild = channel.guild;
  const state = loadTicketState(guild.id);
  for (const [key, id] of Object.entries(state.open)) {
    if (id === channel.id) delete state.open[key];
  }
  saveTicketState(guild.id, state);

  const staffIds = resolveStaffRoleIds(guild, getTicketConfig(guild.id)?.staffRoles || []);
  const isStaff =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    staffIds.some((id) => interaction.member?.roles?.cache?.has(id));

  const openerOverwrite = channel.permissionOverwrites?.cache?.get(interaction.user.id);
  const isOpener = openerOverwrite?.allow.has(PermissionFlagsBits.ViewChannel);

  if (!isStaff && !isOpener) {
    return interaction.reply({
      ephemeral: true,
      content: "Only the ticket opener or staff can close this ticket."
    });
  }

  await interaction.reply({ ephemeral: true, content: "🔒 Closing ticket in 3 seconds…" });
  setTimeout(async () => {
    try {
      await channel.delete("Ticket closed");
    } catch (err) {
      log(`Ticket close failed: ${err.message}`);
    }
  }, 3000);
}

export async function handleTicketInteraction(interaction, client) {
  if (interaction.isStringSelectMenu() && interaction.customId === SELECT_ID) {
    const config = getTicketConfig(interaction.guild.id);
    if (!config) {
      await interaction.reply({
        ephemeral: true,
        content: "Tickets are not configured on this server. Server owner: run `/setup run` or `/setup ticket-panel`."
      });
      return true;
    }

    const categoryId = interaction.values[0];
    await interaction.deferReply({ ephemeral: true });
    try {
      const { channel, alreadyOpen, category, num } = await createTicketChannel(
        interaction.guild,
        interaction.member,
        interaction.channel,
        config,
        categoryId
      );
      if (alreadyOpen) {
        await interaction.editReply({ content: `You already have an open **${category.label}** ticket: ${channel}` });
      } else {
        await interaction.editReply({
          content: `✅ **${category.label}** ticket #${num} created: ${channel}\nStaff have been notified.`
        });
      }
    } catch (err) {
      log(`Create ticket failed: ${err.message}`);
      await interaction.editReply({ content: `❌ Could not create ticket: ${err.message}` });
    }
    return true;
  }

  if (interaction.isButton() && interaction.customId === CLOSE_ID) {
    await closeTicketChannel(interaction.channel, interaction);
    return true;
  }

  return false;
}

export async function deployTicketPanelInGuild(guild, client) {
  const config = getTicketConfig(guild.id);
  if (!config) return false;
  return deployTicketPanelForGuild(guild, client, config);
}
