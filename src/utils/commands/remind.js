import {
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { randomUUID } from "crypto";
import { addReminder } from "../reminders/store.js";

/** Parse simple durations: 10m, 2h, 1d or ISO-ish epoch ms via digits. */
export function parseWhen(when, now = Date.now()) {
  const m = String(when).trim().match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days)$/i);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult = unit.startsWith("m") ? 60_000 : unit.startsWith("h") ? 3_600_000 : 86_400_000;
    return now + n * mult;
  }
  const asNum = Number(when);
  if (Number.isFinite(asNum) && asNum > now) return asNum;
  return null;
}

export const RemindCommandData = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Set a personal reminder (bot will DM you)")
  .addStringOption((o) =>
    o.setName("when").setDescription("e.g. 10m, 2h, 1d").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("text").setDescription("What to remind you about").setRequired(true).setMaxLength(500)
  )
  .toJSON();

export async function handleRemindCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "remind") return false;
  const whenRaw = interaction.options.getString("when", true);
  const text = interaction.options.getString("text", true);
  const dueAt = parseWhen(whenRaw);
  if (!dueAt) {
    await interaction.reply({
      content: "Could not parse `when`. Try `10m`, `2h`, or `1d`.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const id = randomUUID();
  addReminder({
    id,
    userId: interaction.user.id,
    guildId: interaction.guildId || undefined,
    dueAt,
    text,
    status: "pending",
  });
  await interaction.reply({
    content: `Got it — I'll DM you <t:${Math.floor(dueAt / 1000)}:R>: ${text}`,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}
