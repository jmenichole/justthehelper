import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBotOwner,
  guildHasHelperSubscriptionSync,
  matchesHelperGuildSubscription,
  canUseTickets,
} from "./entitlements.js";

describe("entitlements", () => {
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

  it("ignores consumed or ended entitlements", () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    assert.equal(
      guildHasHelperSubscriptionSync("g1", [{ skuId: "sku_helper", guildId: "g1", consumed: true }]),
      false
    );
    assert.equal(
      guildHasHelperSubscriptionSync("g1", [
        { skuId: "sku_helper", guildId: "g1", endsTimestamp: Date.now() - 1000 },
      ]),
      false
    );
  });

  it("matchesHelperGuildSubscription respects guild and sku", () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    assert.equal(
      matchesHelperGuildSubscription("g1", { skuId: "sku_helper", guildId: "g1" }),
      true
    );
    assert.equal(
      matchesHelperGuildSubscription("g2", { skuId: "sku_helper", guildId: "g1" }),
      false
    );
  });

  it("canUseTickets uses discord.js fetch option names", async () => {
    process.env.HELPER_SKU_ID = "sku_helper";
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

  it("canUseTickets denies when fetch returns no matching guild entitlement", async () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    const client = {
      application: {
        entitlements: {
          async fetch() {
            return [{ skuId: "sku_helper", guildId: "other_guild" }];
          },
        },
      },
    };

    const result = await canUseTickets(client, { guildId: "g1" });
    assert.deepEqual(result, { allowed: false, reason: "not_entitled" });
  });

  it("canUseTickets short-circuits on interaction entitlements", async () => {
    process.env.HELPER_SKU_ID = "sku_helper";
    let fetchCalled = false;
    const client = {
      application: {
        entitlements: {
          async fetch() {
            fetchCalled = true;
            return [];
          },
        },
      },
    };

    const result = await canUseTickets(client, {
      guildId: "g1",
      interactionEntitlements: [{ skuId: "sku_helper", guildId: "g1" }],
    });
    assert.equal(fetchCalled, false);
    assert.deepEqual(result, { allowed: true, reason: "interaction" });
  });
});
