import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  applyKofiPayment,
  extractGuildLinkCode,
  parseKofiWebhookBody,
  verifyKofiPayload,
} from "./kofi.js";
import {
  extendGuildSubscription,
  guildHasActiveSubscription,
  loadGuildSubscription,
} from "./subscriptions.js";

const billingDir = path.resolve("data", "billing");

describe("kofi billing", () => {
  beforeEach(() => {
    process.env.KOFI_VERIFICATION_TOKEN = "test-token";
    if (fs.existsSync(billingDir)) fs.rmSync(billingDir, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.KOFI_VERIFICATION_TOKEN;
    if (fs.existsSync(billingDir)) fs.rmSync(billingDir, { recursive: true, force: true });
  });

  it("extracts guild link codes from payment messages", () => {
    assert.equal(extractGuildLinkCode("unlock JTH-abc123 please"), "JTH-ABC123");
    assert.equal(extractGuildLinkCode("no code here"), null);
  });

  it("parses urlencoded webhook bodies", () => {
    const payload = {
      verification_token: "test-token",
      message_id: "m1",
      type: "Subscription",
      is_subscription_payment: true,
      is_first_subscription_payment: true,
      message: "JTH-abc123",
      email: "buyer@example.com",
      kofi_transaction_id: "tx1",
    };
    const raw = `data=${encodeURIComponent(JSON.stringify(payload))}`;
    const parsed = parseKofiWebhookBody(raw);
    assert.equal(parsed.message_id, "m1");
  });

  it("rejects invalid verification tokens", () => {
    const result = verifyKofiPayload({ verification_token: "wrong" });
    assert.equal(result.ok, false);
  });

  it("activates a guild from first subscription payment", () => {
    const payload = {
      verification_token: "test-token",
      message_id: "m1",
      type: "Subscription",
      is_subscription_payment: true,
      is_first_subscription_payment: true,
      message: "please unlock JTH-abc123",
      email: "buyer@example.com",
      kofi_transaction_id: "tx1",
      tier_name: "JustTheHelper",
    };
    const result = applyKofiPayment(payload, { "JTH-ABC123": "guild1" });
    assert.equal(result.applied, true);
    assert.equal(result.guildId, "guild1");
    assert.equal(guildHasActiveSubscription("guild1"), true);
  });

  it("renews by purchaser email when message has no code", () => {
    extendGuildSubscription({
      guildId: "guild1",
      email: "buyer@example.com",
      transactionId: "tx0",
    });

    const payload = {
      verification_token: "test-token",
      message_id: "m2",
      type: "Subscription",
      is_subscription_payment: true,
      is_first_subscription_payment: false,
      message: "",
      email: "buyer@example.com",
      kofi_transaction_id: "tx2",
    };
    const result = applyKofiPayment(payload, {});
    assert.equal(result.applied, true);
    assert.equal(result.guildId, "guild1");
    assert.equal(loadGuildSubscription("guild1").lastTransactionId, "tx2");
  });

  it("deduplicates webhook message ids", () => {
    const payload = {
      verification_token: "test-token",
      message_id: "m-dup",
      type: "Subscription",
      is_subscription_payment: true,
      is_first_subscription_payment: true,
      message: "JTH-abc123",
      email: "buyer@example.com",
      kofi_transaction_id: "tx1",
    };
    const index = { "JTH-ABC123": "guild1" };
    assert.equal(applyKofiPayment(payload, index).applied, true);
    assert.equal(applyKofiPayment(payload, index).reason, "duplicate");
  });
});
