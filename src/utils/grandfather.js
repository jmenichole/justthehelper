import { loadGuildConfig, saveGuildConfig } from "./storage/guildConfig.js";

/** Bot joined before this instant → eligible for one free full/polish apply. */
export const GRANDFATHER_CUTOFF_MS = Date.parse("2026-07-11T00:00:00.000Z");

export function isGrandfatherEligibleByJoin(guild) {
  const joined = guild?.joinedTimestamp;
  if (typeof joined !== "number") return false;
  return joined < GRANDFATHER_CUTOFF_MS;
}

/**
 * True if this guild still has a free full/polish grant left.
 * Migrates old earlyAdopterFreeBuildUsed → already consumed.
 */
export function hasGrandfatherFullLeft(guild) {
  if (!isGrandfatherEligibleByJoin(guild)) return false;
  const cfg = loadGuildConfig(guild.id);
  if (cfg.grandfatherFullBuildUsed) return false;
  if (cfg.earlyAdopterFreeBuildUsed) return false;
  return true;
}

export function markGrandfatherFullUsed(guildId) {
  const cfg = loadGuildConfig(guildId);
  saveGuildConfig(guildId, {
    ...cfg,
    grandfatherFullBuildUsed: true,
    earlyAdopterFreeBuildUsed: true,
  });
}
