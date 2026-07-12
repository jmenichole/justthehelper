import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { canUseTickets } from "../entitlements.js";
import { buildTicketPanelPayload } from "../tickets/threads.js";

export const TicketsCommandData = new SlashCommandBuilder()
  .setName("tickets")
  .setDescription("Paid support tickets (private threads)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("setup")
      .setDescription("Configure ticket parent channel and staff role")
      .addChannelOption((o) => o.setName("channel").setDescription("Parent text channel").setRequired(true))
      .addRoleOption((o) => o.setName("staff_role").setDescription("Staff role to ping").setRequired(true))
  )
  .addSubcommand((s) => s.setName("panel").setDescription("Post the Open ticket panel here"))
  .toJSON();

export async function handleTicketsCommand(interaction, client) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "tickets") return false;
  const access = await canUseTickets(client, {
    guildId: interaction.guildId,
    userId: interaction.user.id,
    interactionEntitlements: interaction.entitlements,
  });
  if (!access.allowed) {
    await interaction.reply({
      content:
        "This server needs JustTheHelper **$1.99/mo** to use tickets (or you must be the bot owner for testing).",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const cfg = loadGuildConfig(interaction.guildId);
  const sub = interaction.options.getSubcommand();
  if (sub === "setup") {
    const channel = interaction.options.getChannel("channel", true);
    const role = interaction.options.getRole("staff_role", true);
    saveGuildConfig(interaction.guildId, {
      ...cfg,
      ticketParentChannelId: channel.id,
      staffRoleIds: [role.id],
    });
    await interaction.reply({
      content: `Tickets parent ${channel}, staff ${role}.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (sub === "panel") {
    const msg = await interaction.channel.send(buildTicketPanelPayload());
    saveGuildConfig(interaction.guildId, {
      ...cfg,
      ticketPanelChannelId: interaction.channelId,
      ticketPanelMessageId: msg.id,
    });
    await interaction.reply({ content: "Ticket panel posted.", flags: MessageFlags.Ephemeral });
    try {
      const { postAnalytics } = await import("../ops.js");
      postAnalytics({
        event: "ticket_panel_posted",
        fields: [{ name: "Guild", value: `\`${interaction.guildId}\``, inline: true }],
      });
    } catch {}
    return true;
  }
  return true;
}
