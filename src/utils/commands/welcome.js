import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { buildWelcomePayload } from "../welcome/handler.js";

export const WelcomeCommandData = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Welcome message and verify button")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName("post").setDescription("Post welcome + Verify button in this channel"))
  .addSubcommand((s) =>
    s
      .setName("set-role")
      .setDescription("Role granted on Verify")
      .addRoleOption((o) => o.setName("role").setDescription("Member role").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("dm")
      .setDescription("Toggle DM after successful Verify")
      .addStringOption((o) =>
        o
          .setName("state")
          .setDescription("on or off")
          .setRequired(true)
          .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
      )
  )
  .addSubcommand((s) =>
    s
      .setName("set-dm")
      .setDescription("Text DMed after Verify when DM is on")
      .addStringOption((o) => o.setName("text").setDescription("DM body").setRequired(true).setMaxLength(1500))
  )
  .toJSON();

export async function handleWelcomeCommand(interaction, client) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "welcome") return false;
  const sub = interaction.options.getSubcommand();
  const cfg = loadGuildConfig(interaction.guildId);

  if (sub === "set-role") {
    const role = interaction.options.getRole("role", true);
    saveGuildConfig(interaction.guildId, { ...cfg, verifyRoleId: role.id });
    await interaction.reply({ content: `Verify role set to ${role}.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "dm") {
    const on = interaction.options.getString("state", true) === "on";
    saveGuildConfig(interaction.guildId, { ...cfg, welcomeDmEnabled: on });
    await interaction.reply({ content: `Welcome DM after Verify: **${on ? "on" : "off"}**.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "set-dm") {
    const text = interaction.options.getString("text", true);
    saveGuildConfig(interaction.guildId, { ...cfg, welcomeDmText: text });
    await interaction.reply({ content: "Welcome DM text saved.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === "post") {
    if (!cfg.verifyRoleId) {
      await interaction.reply({
        content: "Set a role first: `/welcome set-role`.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const payload = buildWelcomePayload(cfg);
    const msg = await interaction.channel.send(payload);
    saveGuildConfig(interaction.guildId, {
      ...cfg,
      welcomeChannelId: interaction.channelId,
      welcomePanelMessageId: msg.id,
    });
    await interaction.reply({ content: "Welcome panel posted.", flags: MessageFlags.Ephemeral });
    try {
      const { postAnalytics } = await import("../ops.js");
      postAnalytics({
        event: "welcome_posted",
        fields: [{ name: "Guild", value: `\`${interaction.guildId}\``, inline: true }],
      });
    } catch {}
    return true;
  }
  return true;
}
