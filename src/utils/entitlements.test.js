import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  isBotOwner,
  guildHasHelperSubscriptionSync,
  canUseTickets,
} from "./entitlements.js";

const billingDir = path.resolve("data", "billing");

describe("entitlements", () => {
  beforeEach(() => {
    if (fs.existsSync(billingDir)) fs.rmSync(billingDir, { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env.BOT_OWNER_ID;
    delete process.env.HELPER_SKU_ID;
    delete process.env.SUBSCRIPTION_SKU_ID;
    delete process.env.KOFI_VERIFICATION_TOKEN;
    delete process.env.BILLING_PROVIDER;
    if (fs.existsSync(billingDir)) fs.rmSync(billingDir, { recursive: true, force: true });
  });

  it("owner is always allowed", () => {
    process.env.BOT_OWNER_ID = "owner1";
    assert.equal(isBotOwner("owner1"), true);
    assert.equal(isBotOwner("other"), false);
  });

  it("sync helper finds matching guild entitlement", () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    const ents = [{ skuId: "sku_helper", guildId: "g1" }];
    assert.equal(guildHasHelperSubscriptionSync("g1", ents), true);
    assert.equal(guildHasHelperSubscriptionSync("g2", ents), false);
  });

  it("returns false when SKU env missing", () => {
    delete process.env.HELPER_SKU_ID;
    delete process.env.SUBSCRIPTION_SKU_ID;
    assert.equal(guildHasHelperSubscriptionSync("g1", [{ skuId: "x", guildId: "g1" }]), false);
  });

  it("canUseTickets allows active Ko-fi subscriptions", async () => {
    process.env.KOFI_VERIFICATION_TOKEN = "token";
    process.env.BILLING_PROVIDER = "kofi";
    const { extendGuildSubscription } = await import("./billing/subscriptions.js");
    extendGuildSubscription({
      guildId: "g1",
      email: "buyer@example.com",
      transactionId: "tx1",
    });

    const result = await canUseTickets({ application: { entitlements: { fetch: async () => [] } } }, {
      guildId: "g1",
    });
    assert.deepEqual(result, { allowed: true, reason: "kofi" });
  });

  it("canUseTickets uses discord.js fetch option names when discord billing enabled", async () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    process.env.BILLING_PROVIDER = "discord";
    let fetchArgs;
    const client = {
      application: {
        entitlements: {
          async fetch(options) {
            fetchArgs = options;
            return [{ skuId: "sku_helper", guildId: "g1" }];
          },
        },
      },
    };

    const result = await canUseTickets(client, { guildId: "g1" });
    assert.deepEqual(fetchArgs, {
      guild: "g1",
      skus: ["sku_helper"],
      excludeEnded: true,
      excludeDeleted: true,
    });
    assert.deepEqual(result, { allowed: true, reason: "fetch" });
  });
});
