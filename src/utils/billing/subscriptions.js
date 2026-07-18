import fs from "fs";
import path from "path";
import { log } from "../logger.js";

const SUBSCRIPTION_MS = 31 * 24 * 60 * 60 * 1000;
const baseDir = path.resolve("data", "billing", "guilds");
const processedPath = path.resolve("data", "billing", "processed-message-ids.json");
const emailIndexPath = path.resolve("data", "billing", "email-index.json");

if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    log(`billing read failed (${file}): ${err.message}`);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function subscriptionPath(guildId) {
  return path.join(baseDir, `${guildId}.json`);
}

export function subscriptionPeriodMs() {
  return SUBSCRIPTION_MS;
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function guildHasActiveSubscription(guildId, now = Date.now()) {
  const record = loadGuildSubscription(guildId);
  return Boolean(record && record.expiresAt > now);
}

export function loadGuildSubscription(guildId) {
  if (!guildId) return null;
  return readJson(subscriptionPath(guildId), null);
}

export function saveGuildSubscription(guildId, record) {
  writeJson(subscriptionPath(guildId), record);
  const email = normalizeEmail(record.email);
  if (email) {
    const index = readJson(emailIndexPath, {});
    index[email] = guildId;
    writeJson(emailIndexPath, index);
  }
}

export function findGuildIdByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const index = readJson(emailIndexPath, {});
  return index[normalized] || null;
}

export function extendGuildSubscription({
  guildId,
  email,
  transactionId,
  tierName,
  fromName,
  now = Date.now(),
}) {
  const existing = loadGuildSubscription(guildId);
  const base = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
  const record = {
    guildId,
    source: "kofi",
    email: normalizeEmail(email) || existing?.email || null,
    tierName: tierName || existing?.tierName || null,
    fromName: fromName || existing?.fromName || null,
    lastTransactionId: transactionId,
    activatedAt: existing?.activatedAt || now,
    updatedAt: now,
    expiresAt: base + SUBSCRIPTION_MS,
  };
  saveGuildSubscription(guildId, record);
  return record;
}

export function hasProcessedMessageId(messageId) {
  if (!messageId) return false;
  const ids = readJson(processedPath, []);
  return ids.includes(messageId);
}

export function markProcessedMessageId(messageId) {
  if (!messageId) return;
  const ids = readJson(processedPath, []);
  if (ids.includes(messageId)) return;
  ids.push(messageId);
  const trimmed = ids.slice(-5000);
  writeJson(processedPath, trimmed);
}

export function subscriptionStatusText(guildId, now = Date.now()) {
  const record = loadGuildSubscription(guildId);
  if (!record) return "No active Ko-fi subscription for this server.";
  if (record.expiresAt <= now) {
    return `Subscription expired on <t:${Math.floor(record.expiresAt / 1000)}:D>. Run \`/subscribe\` to renew on Ko-fi.`;
  }
  return `Tickets are unlocked until <t:${Math.floor(record.expiresAt / 1000)}:F> (Ko-fi).`;
}
