import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { canApplyPolish } from "./entitlements.js";
import { GRANDFATHER_CUTOFF_MS } from "./grandfather.js";

const envBackup = {};

beforeEach(() => {
  envBackup.BOT_OWNER_ID = process.env.BOT_OWNER_ID;
  envBackup.PREMIUM_SKU_ID = process.env.PREMIUM_SKU_ID;
});

afterEach(() => {
  if (envBackup.BOT_OWNER_ID === undefined) delete process.env.BOT_OWNER_ID;
  else process.env.BOT_OWNER_ID = envBackup.BOT_OWNER_ID;
  if (envBackup.PREMIUM_SKU_ID === undefined) delete process.env.PREMIUM_SKU_ID;
  else process.env.PREMIUM_SKU_ID = envBackup.PREMIUM_SKU_ID;
});

describe("canApplyPolish", () => {
  it("allows bot owner", () => {
    process.env.BOT_OWNER_ID = "owner-123";
    const result = canApplyPolish({ user: { id: "owner-123" }, entitlements: [] }, null);
    assert.deepEqual(result, { allowed: true, reason: "owner" });
  });

  it("allows unconsumed basic pack", () => {
    process.env.PREMIUM_SKU_ID = "sku-basic";
    const result = canApplyPolish(
      {
        user: { id: "user-1" },
        entitlements: [{ skuId: "sku-basic", consumed: false }],
      },
      null
    );
    assert.deepEqual(result, { allowed: true, reason: "pack" });
  });

  it("denies when no entitlement path applies", () => {
    delete process.env.BOT_OWNER_ID;
    delete process.env.PREMIUM_SKU_ID;
    const result = canApplyPolish(
      { user: { id: "user-1" }, entitlements: [] },
      { id: "g1", joinedTimestamp: GRANDFATHER_CUTOFF_MS + 1 }
    );
    assert.deepEqual(result, { allowed: false, reason: "denied" });
  });
});
