import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
} from "discord.js";
import { log } from "../logger.js";
import { logStaffPostBuildSurvey } from "../staffLog.js";

const SURVEY_TIMEOUT_MS = 120_000;

const OUTCOMES = {
  great: { label: "⭐ Great — everything worked", value: "great", emoji: "⭐" },
  good: { label: "👍 Good — minor tweaks needed", value: "good", emoji: "👍" },
  issues: { label: "⚠️ Missing channels / embeds / permissions", value: "issues", emoji: "⚠️" },
  bug: { label: "🐛 Bug or broken build", value: "bug", emoji: "🐛" },
  skip: { label: "Skip feedback", value: "skip", emoji: "⏭️" }
};

/**
 * Optional DM survey after a successful build; logs to support #staff-logs.
 * @param {import('discord.js').User} user
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Client} client
 * @param {{
 *   preset?: string | null,
 *   customRequest?: string | null,
 *   metrics?: { buildSeconds?: string, categoryCount?: number, channelCount?: number, roleCount?: number } | null
 * }} [context]
 */
export async function runPostBuildSurvey(user, guild, client, context = {}) {
  const dm = await user.createDM().catch(() => null);
  if (!dm) return;

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("post_build_survey")
      .setPlaceholder("How did the build go?")
      .addOptions(
        Object.values(OUTCOMES).map((o) => ({
          label: o.label.slice(0, 100),
          value: o.value,
          emoji: o.emoji
        }))
      )
  );

  const prompt = await dm
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Quick feedback (optional)")
          .setDescription(
            "Helps us fix bugs and improve builds. Takes ~10 seconds — or choose **Skip**."
          )
      ],
      components: [row]
    })
    .catch(() => null);

  if (!prompt) return;

  let outcome = "skip";
  let details = "";

  try {
    const pick = await prompt.awaitMessageComponent({
      filter: (i) => i.user.id === user.id && i.customId === "post_build_survey",
      time: SURVEY_TIMEOUT_MS
    });

    outcome = pick.values[0] || "skip";
    await pick.update({
      content: outcome === "skip" ? "👍 Skipped — thanks for using JustTheBuilder!" : "Thanks! One more optional question…",
      embeds: [],
      components: []
    });

    if (outcome === "issues" || outcome === "bug" || outcome === "good") {
      await dm.send(
        outcome === "bug"
          ? "What broke? (missing channels, embeds, permissions, errors — **one message**, or type `skip`)"
          : "Anything we should know? (**one message**, or type `skip`)"
      );
      try {
        const replies = await dm.awaitMessages({
          filter: (m) => m.author.id === user.id,
          max: 1,
          time: 90_000
        });
        const text = replies.first()?.content?.trim() || "";
        if (text && !/^skip$/i.test(text)) details = text;
      } catch {
        /* timeout ok */
      }
    }

    if (outcome !== "skip") {
      await dm.send("✅ Sent to the team — appreciate the feedback!");
    }
  } catch (err) {
    log(`postBuildSurvey: ${err.message}`);
    await prompt.edit({ components: [] }).catch(() => {});
    return;
  }

  logStaffPostBuildSurvey(client, {
    guild,
    user,
    outcome,
    details,
    preset: context.preset || null,
    customRequest: context.customRequest || null,
    metrics: context.metrics || null
  });
}
