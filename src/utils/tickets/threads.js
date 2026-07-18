import fs from "fs";
import path from "path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { loadGuildConfig } from "../storage/guildConfig.js";
import { canUseTickets } from "../entitlements.js";
import { ticketPaywallMessage } from "../billing/paywall.js";
import { log } from "../logger.js";

export const OPEN_ID = "jth_ticket_open";
export const CLAIM_ID = "jth_ticket_claim";
export const CLOSE_ID = "jth_ticket_close";

function ticketsPath(guildId) {
  const dir = path.resolve("data", "tickets");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${guildId}.json`);
}

export function loadTicketState(guildId) {
  const p = ticketsPath(guildId);
  if (!fs.existsSync(p)) return { counter: 0, open: {} };
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return { counter: 0, open: {} };
  }
}

export function saveTicketState(guildId, state) {
  fs.writeFileSync(ticketsPath(guildId), JSON.stringify(state, null, 2));
}

export function findOpenTicketForUser(state, userId) {
  for (const [threadId, meta] of Object.entries(state.open || {})) {
    if (meta.userId === userId) return threadId;
  }
  return null;
}

export function buildTicketPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Support tickets")
    .setDescription("Click below to open a private thread with staff.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(OPEN_ID).setLabel("Open ticket").setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

function staffControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CLAIM_ID).setLabel("Claim").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CLOSE_ID).setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

export async function handleTicketInteraction(interaction, client) {
  if (interaction.isButton() && interaction.customId === OPEN_ID) {
    return openTicket(interaction, client);
  }
  if (interaction.isButton() && interaction.customId === CLAIM_ID) {
    return claimTicket(interaction);
  }
  if (interaction.isButton() && interaction.customId === CLOSE_ID) {
    return closeTicket(interaction);
  }
  return false;
}

async function denyPaywall(interaction) {
  await interaction.reply({
    content: ticketPaywallMessage(),
    flags: MessageFlags.Ephemeral,
  });
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({
      event: "unlock_denied",
      fields: [
        { name: "Guild", value: `\`${interaction.guildId}\``, inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
  } catch {}
}

const STAFF_ADD_CAP = 15;

/** Best-effort: add staff-role members to a private ticket thread (capped). */
async function addStaffMembersToThread(thread, interaction, staffRoleIds) {
  const roleIds = staffRoleIds || [];
  if (!roleIds.length) return;

  let members;
  try {
    members = await interaction.guild.members.fetch();
  } catch (err) {
    log(
      `ticket_staff_add_skipped: need Manage Threads or GuildMembers intent (${err.message})`
    );
    return;
  }

  let added = 0;
  for (const member of members.values()) {
    if (added >= STAFF_ADD_CAP) break;
    if (member.user.bot || member.id === interaction.user.id) continue;
    if (!roleIds.some((id) => member.roles.cache.has(id))) continue;
    try {
      await thread.members.add(member.id);
      added += 1;
    } catch {
      // Individual add may fail without Manage Threads; role mentions still notify.
    }
  }
}

async function openTicket(interaction, client) {
  // Owner bypass first (canUseTickets); everyone else needs guild entitlement.
  const guildGate = await canUseTickets(client, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    interactionEntitlements: interaction.entitlements,
  });
  if (!guildGate.allowed) {
    await denyPaywall(interaction);
    return true;
  }

  const cfg = loadGuildConfig(interaction.guildId);
  const parentId = cfg.ticketParentChannelId || interaction.channelId;
  const parent = await interaction.guild.channels.fetch(parentId).catch(() => null);
  if (!parent || parent.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Ticket parent must be a text channel. Run `/tickets setup`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const state = loadTicketState(interaction.guildId);
  const existing = findOpenTicketForUser(state, interaction.user.id);
  if (existing) {
    await interaction.reply({
      content: `You already have an open ticket: <#${existing}>`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  state.counter += 1;
  const num = state.counter;
  const name = `ticket-${num}-${(interaction.user.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)}`;

  let thread;
  try {
    thread = await parent.threads.create({
      name: name.slice(0, 100),
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: "JustTheHelper ticket",
    });
    await thread.members.add(interaction.user.id);
  } catch (err) {
    await interaction.editReply({
      content: `Could not create private thread (need Create Private Threads): ${err.message}`,
    });
    return true;
  }

  await addStaffMembersToThread(thread, interaction, cfg.staffRoleIds);

  state.open[thread.id] = { userId: interaction.user.id, createdAt: Date.now() };
  saveTicketState(interaction.guildId, state);

  const staffMentions = (cfg.staffRoleIds || []).map((id) => `<@&${id}>`).join(" ");
  await thread.send({
    content: `${staffMentions}\nTicket from <@${interaction.user.id}>`.trim(),
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Ticket #${num}`)
        .setDescription("Staff can Claim or Close below."),
    ],
    components: [staffControls()],
  });

  await interaction.editReply({ content: `Opened ${thread}` });
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({
      event: "ticket_opened",
      fields: [
        { name: "Guild", value: `\`${interaction.guildId}\``, inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
  } catch {}
  return true;
}

async function claimTicket(interaction) {
  const state = loadTicketState(interaction.guildId);
  const meta = state.open[interaction.channelId];
  if (!meta) {
    await interaction.reply({ content: "Not an open Helper ticket.", flags: MessageFlags.Ephemeral });
    return true;
  }
  meta.claimedBy = interaction.user.id;
  saveTicketState(interaction.guildId, state);
  await interaction.reply({ content: `Claimed by <@${interaction.user.id}>` });
  return true;
}

async function closeTicket(interaction) {
  const state = loadTicketState(interaction.guildId);
  if (!state.open[interaction.channelId]) {
    await interaction.reply({ content: "Not an open Helper ticket.", flags: MessageFlags.Ephemeral });
    return true;
  }
  delete state.open[interaction.channelId];
  saveTicketState(interaction.guildId, state);
  await interaction.reply({ content: "Ticket closed." });
  try {
    await interaction.channel.setLocked(true);
  } catch (err) {
    log(`ticket_lock_failed: ${err.message}`);
  }
  try {
    await interaction.channel.setArchived(true);
  } catch (err) {
    log(`ticket_archive_failed: ${err.message}`);
  }
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({
      event: "ticket_closed",
      fields: [
        { name: "Guild", value: `\`${interaction.guildId}\``, inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
  } catch {}
  return true;
}
