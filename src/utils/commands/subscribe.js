import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from "discord.js";
import { ensureGuildLinkCode } from "../billing/guildCodes.js";
import { kofiPageUrl, isKofiConfigured } from "../billing/kofi.js";
import { subscriptionStatusText } from "../billing/subscriptions.js";
import { usesKofiBilling } from "../billing/paywall.js";

export const SubscribeCommandData = new SlashCommandBuilder()
  .setName("subscribe")
  .setDescription("JustTheHelper billing via Ko-fi")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName("info").setDescription("Show Ko-fi link and this server's link code"))
  .addSubcommand((s) => s.setName("status").setDescription("Check whether tickets are unlocked for this server"))
  .toJSON();

export async function handleSubscribeCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "subscribe") return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!usesKofiBilling() || !isKofiConfigured()) {
    await interaction.editReply({
      content: "Ko-fi billing is not configured on this bot. Set `KOFI_VERIFICATION_TOKEN` and `KOFI_PAGE_URL`.",
    });
    return true;
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    await interaction.editReply({ content: subscriptionStatusText(interaction.guildId) });
    return true;
  }

  const code = ensureGuildLinkCode(interaction.guildId);
  const page = kofiPageUrl();
  const embed = new EmbedBuilder()
    .setColor(0xff5e5b)
    .setTitle("Unlock tickets with Ko-fi")
    .setDescription(
      "JustTheHelper tickets cost **$1.99/mo per server**. Subscribe on Ko-fi and include your server link code in the payment message so we can unlock this guild."
    )
    .addFields(
      { name: "Server link code", value: `\`${code}\``, inline: true },
      { name: "Guild ID", value: `\`${interaction.guildId}\``, inline: true },
      {
        name: "How to pay",
        value:
          "1. Open the Ko-fi membership link below\n" +
          `2. Paste **${code}** in the message field\n` +
          "3. Complete payment\n" +
          "4. Run `/subscribe status` — tickets unlock within a minute",
      }
    );

  if (page) {
    embed.addFields({ name: "Ko-fi", value: page });
  }

  await interaction.editReply({ embeds: [embed] });
  return true;
}
