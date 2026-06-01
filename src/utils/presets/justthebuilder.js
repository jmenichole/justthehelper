import fs from "fs";
import path from "path";

const TEMPLATE_PATH = path.resolve("templates", "justthebuilder.json");

export const JUSTTHEBUILDER_TICKET_CATEGORIES = [
  {
    id: "support",
    label: "Support & Bugs",
    description: "Help, billing questions, or report a bug (include steps to reproduce)",
    emoji: "🛟"
  },
  {
    id: "billing",
    label: "Billing",
    description: "Purchases, Basic Pack, or Pro subscription",
    emoji: "💳"
  },
  {
    id: "feature",
    label: "Feature Request",
    description: "Suggest improvements for JustTheBuilder",
    emoji: "✨"
  }
];

/** @deprecated use JUSTTHEBUILDER_TICKET_CATEGORIES */
export const JUSTTHETIP_TICKET_CATEGORIES = JUSTTHEBUILDER_TICKET_CATEGORIES;

export const SUPPORT_PRESET_IDS = ["justthebuilder", "justthetip"];

export function isSupportPreset(preset) {
  return SUPPORT_PRESET_IDS.includes(preset);
}

/**
 * Load full JustTheBuilder official support server blueprint.
 * @param {import('discord.js').Guild} guild
 */
export function loadJustTheBuilderBlueprint(guild) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error("templates/justthebuilder.json not found");
  }

  const blueprint = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf-8"));

  blueprint.tickets = {
    enabled: true,
    panelChannel: "create-ticket",
    categories: JUSTTHEBUILDER_TICKET_CATEGORIES,
    staffRoles: ["Support Agent", "Founder"]
  };

  for (const catName of Object.keys(blueprint.categories || {})) {
    const channels = blueprint.categories[catName];
    if (!Array.isArray(channels)) continue;

    blueprint.categories[catName] = channels
      .filter((ch) => ch.name !== "bug-reports")
      .map((ch) => {
        const name = (ch.name || "").toLowerCase();
        const copy = { ...ch };

        if (name === "rules") {
          copy.pinMessage = true;
          copy.topic = copy.topic || "Read before chatting — server guidelines";
          copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
        }
        if (name === "welcome") {
          copy.topic = copy.topic || "Start here — welcome & quick links";
          copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
        }
        if (name === "faq") {
          copy.topic = copy.topic || "Frequently asked questions";
          copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
        }
        if (name === "create-ticket") {
          copy.topic = copy.topic || "Open a private support ticket — pick a category below";
          copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
          copy.message = {
            title: "🎟️ Open a Support Ticket",
            body:
              "Need assistance with **billing**, **subscriptions**, **bugs**, or **custom configurations**?\n\n" +
              "Our team is here to help!\n\n" +
              "**Anyone** can open a ticket — choose **Support & Bugs**, **Billing**, or **Feature Request** below. Staff are notified automatically."
          };
        }
        if (name === "general") {
          copy.topic = copy.topic || "General chat for builders";
        }
        if (name === "bot-commands" || name === "bot-spam") {
          copy.topic = copy.topic || "Bot commands only";
        }

        return copy;
      });
  }

  return blueprint;
}

/** @deprecated */
export const loadJustTheTipBlueprint = loadJustTheBuilderBlueprint;

export const JUSTTHEBUILDER_BUILD_SUMMARY = [
  "💎 **JustTheBuilder support preset** — full build:",
  "• Roles (Founder, Support Agent, Premium, Builder)",
  "• Channels + 💎 emoji prefix",
  "• Embeds: welcome, rules (pinned), FAQ, create-ticket",
  "• Ticket panel: Support & Bugs, Billing, Feature Request",
  "• Staff-only areas + announcement channel"
].join("\n");

export const JUSTTHETIP_BUILD_SUMMARY = JUSTTHEBUILDER_BUILD_SUMMARY;
