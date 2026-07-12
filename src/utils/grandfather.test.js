import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  GRANDFATHER_CUTOFF_MS,
  isGrandfatherEligibleByJoin,
  hasGrandfatherFullLeft,
} from "./grandfather.js";
import { saveGuildConfig } from "./storage/guildConfig.js";

const trackedGuildIds = [];

function trackGuild(id) {
  trackedGuildIds.push(id);
}

afterEach(() => {
  for (const id of trackedGuildIds) {
    const file = path.join("data", "guilds", `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  trackedGuildIds.length = 0;
});

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

describe("hasGrandfatherFullLeft", () => {
  it("returns true for eligible join with no flags", () => {
    const guild = { id: "gf-free-1", joinedTimestamp: GRANDFATHER_CUTOFF_MS - 1000 };
    trackGuild(guild.id);
    assert.equal(hasGrandfatherFullLeft(guild), true);
  });

  it("returns false when earlyAdopterFreeBuildUsed is true", () => {
    const guild = { id: "gf-early-1", joinedTimestamp: GRANDFATHER_CUTOFF_MS - 1000 };
    trackGuild(guild.id);
    saveGuildConfig(guild.id, { earlyAdopterFreeBuildUsed: true });
    assert.equal(hasGrandfatherFullLeft(guild), false);
  });

  it("returns false when grandfatherFullBuildUsed is true", () => {
    const guild = { id: "gf-used-1", joinedTimestamp: GRANDFATHER_CUTOFF_MS - 1000 };
    trackGuild(guild.id);
    saveGuildConfig(guild.id, { grandfatherFullBuildUsed: true });
    assert.equal(hasGrandfatherFullLeft(guild), false);
  });
});
