import { log } from "../logger.js";
import {
  extendGuildSubscription,
  findGuildIdByEmail,
  hasProcessedMessageId,
  markProcessedMessageId,
} from "./subscriptions.js";

const LINK_CODE_RE = /\bJTH-[A-Z0-9]{6}\b/i;

export function kofiPageUrl() {
  return (process.env.KOFI_PAGE_URL || process.env.KOFI_SHOP_URL || "").trim();
}

export function kofiVerificationToken() {
  return (
    process.env.KOFI_VERIFICATION_TOKEN ||
    process.env.KOFI_API_KEY ||
    process.env.KOFI_TOKEN ||
    ""
  ).trim();
}

export function kofiTierName() {
  return (process.env.KOFI_TIER_NAME || "").trim();
}

export function isKofiConfigured() {
  return Boolean(kofiVerificationToken());
}

export function extractGuildLinkCode(message) {
  const match = String(message || "").match(LINK_CODE_RE);
  return match ? match[0].toUpperCase() : null;
}

export function parseKofiWebhookBody(rawBody) {
  const raw = String(rawBody || "").trim();
  if (!raw) throw new Error("empty body");

  const params = new URLSearchParams(raw);
  const data = params.get("data");
  if (data) return JSON.parse(data);

  if (raw.startsWith("data=")) {
    return JSON.parse(decodeURIComponent(raw.slice(5)));
  }

  throw new Error("missing data field");
}

export function verifyKofiPayload(payload) {
  const expected = kofiVerificationToken();
  if (!expected) return { ok: false, reason: "kofi_unconfigured" };
  if (!payload || payload.verification_token !== expected) {
    return { ok: false, reason: "invalid_token" };
  }
  return { ok: true };
}

function tierMatches(payload) {
  const required = kofiTierName();
  if (!required) return true;
  return String(payload.tier_name || "").trim().toLowerCase() === required.toLowerCase();
}

function isRelevantPayment(payload) {
  if (!tierMatches(payload)) return false;
  if (payload.type === "Subscription" && payload.is_subscription_payment) return true;
  if (payload.type === "Donation" && extractGuildLinkCode(payload.message)) return true;
  if (payload.type === "Shop Order" && extractGuildLinkCode(payload.message)) return true;
  return false;
}

function resolveGuildId(payload, guildCodeIndex) {
  const code = extractGuildLinkCode(payload.message);
  if (code && guildCodeIndex?.[code]) return guildCodeIndex[code];

  if (payload.is_subscription_payment && !payload.is_first_subscription_payment) {
    return findGuildIdByEmail(payload.email);
  }

  return null;
}

/**
 * Apply a verified Ko-fi webhook payload.
 * @param {object} payload Parsed Ko-fi JSON
 * @param {Record<string, string>} guildCodeIndex map of JTH-XXXXXX -> guildId
 */
export function applyKofiPayment(payload, guildCodeIndex = {}) {
  if (!isRelevantPayment(payload)) {
    return { applied: false, reason: "ignored_type" };
  }

  if (hasProcessedMessageId(payload.message_id)) {
    return { applied: false, reason: "duplicate" };
  }

  const guildId = resolveGuildId(payload, guildCodeIndex);
  if (!guildId) {
    return { applied: false, reason: "guild_not_found" };
  }

  const record = extendGuildSubscription({
    guildId,
    email: payload.email,
    transactionId: payload.kofi_transaction_id,
    tierName: payload.tier_name,
    fromName: payload.from_name,
  });

  markProcessedMessageId(payload.message_id);
  log(
    `Ko-fi subscription applied for guild ${guildId} until ${new Date(record.expiresAt).toISOString()}`
  );

  return {
    applied: true,
    guildId,
    record,
    renewal: Boolean(payload.is_subscription_payment && !payload.is_first_subscription_payment),
  };
}
