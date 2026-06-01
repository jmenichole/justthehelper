import { A, parseYes, parseVoiceAnnounce } from "./interviewConfig.js";
import { inferRuleTemplate, inferFaqTemplate } from "./ruleTemplates.js";
import { buildTicketsConfigFromInterview } from "../tickets/config.js";

function findInfoCategory(blueprint) {
  const names = Object.keys(blueprint.categories || {});
  const preferred = names.find((n) => /info|welcome|server/i.test(n));
  return preferred || names[0];
}

function findOrCreateCategory(blueprint, pattern, fallbackName) {
  const names = Object.keys(blueprint.categories || {});
  const hit = names.find((n) => pattern.test(n));
  if (hit) return hit;
  blueprint.categories[fallbackName] = blueprint.categories[fallbackName] || [];
  return fallbackName;
}

function channelExists(blueprint, matcher) {
  for (const channels of Object.values(blueprint.categories || {})) {
    if (channels.some((ch) => matcher(ch))) return true;
  }
  return false;
}

function addChannel(blueprint, categoryName, chDef) {
  if (!blueprint.categories[categoryName]) blueprint.categories[categoryName] = [];
  const list = blueprint.categories[categoryName];
  if (!list.some((c) => c.name === chDef.name)) list.push(chDef);
}

/**
 * Apply branding emoji to blueprint style.
 */
export function applyBranding(blueprint, answers) {
  const raw = (answers[A.BRANDING] || "").trim();
  if (!raw || /skip|none/i.test(raw)) return;
  const emoji = raw.replace(/\(.*\)/, "").trim().split(/\s+/)[0];
  if (!emoji) return;
  blueprint.style = blueprint.style || {};
  blueprint.style.emojiPrefix = emoji;
  blueprint.branding = blueprint.branding || {};
  blueprint.branding.emoji = emoji;
}

/**
 * Inject welcome, rules, about, faq messages when user opted in.
 */
export async function injectInfoEmbeds(blueprint, guild, answers, selectedRuleTemplate) {
  const catName = findInfoCategory(blueprint);
  if (!catName) return { injectedRules: false, ruleTemplate: null, faqTemplate: null };

  const existing = [...(blueprint.categories[catName] || [])];
  let rulesChannel = existing.find((ch) => ch.name?.toLowerCase().includes("rule"));
  const hasAbout = existing.some((ch) => ch.name?.toLowerCase().includes("about"));
  const hasFaq = existing.some((ch) => ch.name?.toLowerCase().includes("faq"));
  const hasWelcome = existing.some((ch) => ch.name?.toLowerCase().includes("welcome"));

  const { RULE_TEMPLATES, FAQ_TEMPLATES } = await import("./ruleTemplates.js");
  const ruleTemplate = selectedRuleTemplate
    ? RULE_TEMPLATES[selectedRuleTemplate]
    : inferRuleTemplate(answers[A.ABOUT]);
  const faqTemplate = selectedRuleTemplate
    ? FAQ_TEMPLATES[selectedRuleTemplate]
    : inferFaqTemplate(answers[A.ABOUT]);

  const extraLine = formatExtrasForCopy(answers[A.EXTRAS]);
  const aboutBody = [
    `Welcome to ${guild.name}!`,
    "",
    answers[A.ABOUT] || "A community server.",
    extraLine ? `\n${extraLine}` : "",
    "",
    "Read the rules, then say hi in general chat."
  ]
    .filter(Boolean)
    .join("\n");

  let injectedRules = false;
  if (!rulesChannel) {
    rulesChannel = {
      name: "rules",
      type: "text",
      permissionsPreset: "public-readonly",
      pinMessage: true,
      topic: "Please read before chatting"
    };
    existing.unshift(rulesChannel);
  }

  if (!rulesChannel.message) {
    const rulesBody =
      ruleTemplate.rules.map((r, i) => `${i + 1}. ${r}`).join("\n") + "\n\n" + ruleTemplate.footer;
    rulesChannel.message = { title: ruleTemplate.title, body: rulesBody };
    rulesChannel.pinMessage = true;
    rulesChannel.topic = rulesChannel.topic || "Server rules";
    injectedRules = true;
  }

  if (!hasWelcome) {
    existing.unshift({
      name: "welcome",
      type: "text",
      topic: "Start here",
      message: {
        title: `👋 Welcome to ${guild.name}`,
        body: aboutBody
      }
    });
  } else {
    const welcome = existing.find((ch) => ch.name?.toLowerCase().includes("welcome"));
    if (welcome && !welcome.message) {
      welcome.message = {
        title: `👋 Welcome to ${guild.name}`,
        body: aboutBody
      };
      welcome.topic = welcome.topic || "Start here";
    }
  }

  if (!hasAbout) {
    existing.push({
      name: "about",
      type: "text",
      topic: "About this community",
      message: {
        title: "🧩 About This Server",
        body: aboutBody
      }
    });
  }

  if (!hasFaq) {
    const faqBody = faqTemplate.map((qa) => `**Q: ${qa.q}**\nA: ${qa.a}`).join("\n\n");
    existing.push({
      name: "faq",
      type: "text",
      topic: "Common questions",
      message: {
        title: "❓ Frequently Asked Questions",
        body: faqBody
      }
    });
  }

  blueprint.categories[catName] = existing;
  return { injectedRules, ruleTemplate, faqTemplate };
}

function formatExtrasForCopy(extrasAnswer) {
  const e = (extrasAnswer || "").trim();
  if (!e || /^none$/i.test(e)) return "";
  if (/links:/i.test(e)) return e.replace(/^links:\s*/i, "");
  return "";
}

/**
 * Ensure voice / announcements channels exist per interview answers.
 */
export function ensureVoiceAndAnnouncements(blueprint, answers) {
  const { voice, announcements } = parseVoiceAnnounce(answers[A.VOICE_ANNOUNCE]);

  if (voice && !channelExists(blueprint, (ch) => ch.type === "voice" || /voice/i.test(ch.name))) {
    const cat = findOrCreateCategory(blueprint, /community|general|public/i, "COMMUNITY");
    addChannel(blueprint, cat, { name: "voice-lounge", type: "voice", order: 99 });
  }

  if (
    announcements &&
    !channelExists(blueprint, (ch) => ch.type === "announcement" || /announce/i.test(ch.name))
  ) {
    const cat = findOrCreateCategory(blueprint, /info|official|server/i, "INFO");
    addChannel(blueprint, cat, {
      name: "announcements",
      type: "announcement",
      permissionsPreset: "announcement-lock",
      order: 2
    });
  }
}

/**
 * Parse extras for ticket + verified-only channels.
 */
export function applyExtras(blueprint, answers) {
  const e = (answers[A.EXTRAS] || "").toLowerCase();
  if (!e || e === "none") return;

  const verifiedMatch = answers[A.EXTRAS].match(/verified[- ]?only:\s*([^\n,]+)/i);
  if (verifiedMatch) {
    const chName = verifiedMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
    const cat = findOrCreateCategory(blueprint, /holder|vip|community/i, "COMMUNITY");
    if (!channelExists(blueprint, (ch) => ch.name === chName)) {
      addChannel(blueprint, cat, {
        name: chName,
        type: "text",
        permissionsPreset: "verified-only"
      });
    }
  }
}

/**
 * Apply community flag and guild display name on blueprint.
 */
export function applyInterviewMeta(blueprint, guild, answers) {
  blueprint.name = guild.name;
  blueprint.community = parseYes(answers[A.COMMUNITY]);
}

/**
 * Configure ticket system on blueprint and ensure #create-ticket exists.
 */
export function applyTicketsToBlueprint(blueprint, answers, { categoriesAnswer = "", preset = null } = {}) {
  const tickets = buildTicketsConfigFromInterview(answers, A, {
    supportStyle: preset === "support",
    categoriesAnswer
  });
  blueprint.tickets = tickets;
  if (!tickets.enabled) return;

  const cat = findOrCreateCategory(blueprint, /support|help|client|ticket/i, "SUPPORT");
  if (!channelExists(blueprint, (ch) => /create-ticket|open-ticket/i.test(ch.name))) {
    addChannel(blueprint, cat, {
      name: "create-ticket",
      type: "text",
      permissionsPreset: "public-readonly",
      message: {
        title: "🎟️ Open a Support Ticket",
        body:
          "Need help? **Anyone** can open a private ticket.\n\n" +
          "Choose a **category** below — our staff will be notified automatically."
      }
    });
  }
}
