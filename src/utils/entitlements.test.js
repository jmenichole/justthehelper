import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBotOwner,
  guildHasHelperSubscriptionSync,
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
});
