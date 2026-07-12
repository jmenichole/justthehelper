import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { loadGuildConfig } from "../storage/guildConfig.js";
import { log } from "../logger.js";

export const VERIFY_BUTTON_ID = "jth_verify";

export function buildWelcomePayload(cfg) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Welcome")
    .setDescription(cfg.welcomeEmbedText || "Click **Verify** to get access.");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel("Verify").setStyle(ButtonStyle.Success)
  );
  return { embeds: [embed], components: [row] };
}

export async function handleVerifyButton(interaction, client) {
  if (!interaction.isButton() || interaction.customId !== VERIFY_BUTTON_ID) return false;
  const cfg = loadGuildConfig(interaction.guildId);
  if (!cfg.verifyRoleId) {
    await interaction.reply({
      content: "Verify role is not configured. An admin must run `/welcome set-role`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const member = interaction.member;
  const role = interaction.guild.roles.cache.get(cfg.verifyRoleId);
  if (!role) {
    await interaction.reply({ content: "Configured verify role no longer exists.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!member.roles.cache.has(role.id)) {
    try {
      await member.roles.add(role, "JustTheHelper verify");
    } catch (err) {
      await interaction.reply({
        content: `Could not grant role (check bot role hierarchy / Manage Roles): ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
  }
  await interaction.reply({ content: "You're verified ✅", flags: MessageFlags.Ephemeral });
  if (cfg.welcomeDmEnabled && cfg.welcomeDmText) {
    try {
      await interaction.user.send(cfg.welcomeDmText.slice(0, 1800));
    } catch (err) {
      log(`welcome_dm_failed ${interaction.user.id}: ${err.message}`);
    }
  }
  try {
    const { postAnalytics } = await import("../ops.js");
    postAnalytics({
      event: "verify_success",
      fields: [
        { name: "Guild", value: `\`${interaction.guildId}\``, inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      ],
    });
  } catch {}
  return true;
}
