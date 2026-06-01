import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";

/** Default categories when none specified in interview */
export const DEFAULT_CATEGORIES = [
  { id: "general", label: "General Help", description: "Questions about the server", emoji: "💬" },
  { id: "report", label: "Report", description: "Report a user or issue", emoji: "🚨" },
  { id: "billing", label: "Billing", description: "Payments or subscriptions", emoji: "💳" },
  { id: "technical", label: "Technical", description: "Bugs or technical problems", emoji: "🔧" }
];

const SUPPORT_CATEGORIES = [
  { id: "help", label: "General Help", description: "How to use the bot or server", emoji: "❓" },
  { id: "billing", label: "Billing", description: "Purchases & subscriptions", emoji: "💳" },
  { id: "bug", label: "Bug Report", description: "Something is broken", emoji: "🐛" },
  { id: "feature", label: "Feature Request", description: "Suggest an improvement", emoji: "✨" }
];

/**
 * Parse staff role names from interview roles answer.
 * @param {string} rolesAnswer
 */
export function parseStaffRolesFromAnswer(rolesAnswer) {
  const names = (rolesAnswer || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const staff = names.filter((n) =>
    /admin|mod|moderator|staff|support|founder|owner|manager|helper/i.test(n)
  );
  return staff.length ? staff : ["Moderator", "Admin"];
}

/**
 * Parse ticket categories from comma-separated answer.
 * @param {string} answer
 */
export function parseCategoriesFromAnswer(answer) {
  const parts = (answer || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return DEFAULT_CATEGORIES;
  return parts.slice(0, 8).map((label, i) => {
    const id = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || `cat-${i}`;
    return {
      id,
      label: label.slice(0, 80),
      description: `Ticket category: ${label}`,
      emoji: "🎟️"
    };
  });
}

/**
 * Build tickets config for blueprint from interview answers.
 * @param {string[]} answers
 * @param {import('./interviewConfig.js').A} A - index constants
 */
export function buildTicketsConfigFromInterview(
  answers,
  A,
  { supportStyle = false, categoriesAnswer = "" } = {}
) {
  const enabled = (answers[A.TICKETS] || "").toLowerCase().includes("yes");
  if (!enabled) return { enabled: false };

  const useSupport = supportStyle || (answers[A.ABOUT] || "").toLowerCase().includes("support");
  const categories = categoriesAnswer
    ? parseCategoriesFromAnswer(categoriesAnswer)
    : useSupport
      ? SUPPORT_CATEGORIES
      : DEFAULT_CATEGORIES;

  return {
    enabled: true,
    panelChannel: "create-ticket",
    categories,
    staffRoles: parseStaffRolesFromAnswer(answers[A.ROLES])
  };
}

export function getTicketConfig(guildId) {
  const cfg = loadGuildConfig(guildId);
  if (cfg.tickets?.enabled) return cfg.tickets;
  return null;
}

export function saveTicketConfig(guildId, tickets, blueprint) {
  const cfg = loadGuildConfig(guildId);
  saveGuildConfig(guildId, {
    ...cfg,
    tickets,
    lastBlueprint: blueprint || cfg.lastBlueprint
  });
}
