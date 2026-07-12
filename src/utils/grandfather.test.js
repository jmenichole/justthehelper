import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GRANDFATHER_CUTOFF_MS, isGrandfatherEligibleByJoin } from "./grandfather.js";

describe("grandfather", () => {
  it("allows joins before cutoff", () => {
    assert.equal(
      isGrandfatherEligibleByJoin({ joinedTimestamp: GRANDFATHER_CUTOFF_MS - 1000 }),
      true
    );
  });
  it("denies joins on/after cutoff", () => {
    assert.equal(
      isGrandfatherEligibleByJoin({ joinedTimestamp: GRANDFATHER_CUTOFF_MS }),
      false
    );
    assert.equal(
      isGrandfatherEligibleByJoin({ joinedTimestamp: GRANDFATHER_CUTOFF_MS + 1 }),
      false
    );
  });
});
