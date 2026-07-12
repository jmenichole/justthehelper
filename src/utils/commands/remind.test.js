import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWhen } from "./remind.js";

describe("parseWhen", () => {
  const now = 1_000_000;
  it("parses minutes", () => assert.equal(parseWhen("10m", now), now + 600_000));
  it("rejects garbage", () => assert.equal(parseWhen("tomorrow", now), null));
});
