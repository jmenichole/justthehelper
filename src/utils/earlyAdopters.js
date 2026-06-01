import fs from "fs";
import path from "path";
import { loadGuildConfig, saveGuildConfig } from "./storage/guildConfig.js";
import { log } from "./logger.js";

const earlyAdoptersPath = () => path.resolve("data", "early_adopters.json");

/**
 * Guild IDs eligible for the one-time early-adopter free build.
 * @returns {string[]}
 */
export function loadEarlyAdopterIds() {
  const file = earlyAdoptersPath();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(data) ? data.map(String) : [];
  } catch (err) {
    log(`early_adopters.json parse failed: ${err.message}`);
    return [];
  }
}

/**
 * @param {string} guildId
 */
export function addEarlyAdopterGuild(guildId) {
  const ids = loadEarlyAdopterIds();
  if (ids.includes(guildId)) return false;
  const dir = path.dirname(earlyAdoptersPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  ids.push(guildId);
  fs.writeFileSync(earlyAdoptersPath(), JSON.stringify(ids, null, 2));
  return true;
}

/**
 * @param {string} guildId
 * @returns {{ onList: boolean, hasFreeBuildLeft: boolean }}
 */
export function getEarlyAdopterStatus(guildId) {
  const onList = loadEarlyAdopterIds().includes(guildId);
  if (!onList) return { onList: false, hasFreeBuildLeft: false };
  const cfg = loadGuildConfig(guildId);
  return { onList: true, hasFreeBuildLeft: !cfg.earlyAdopterFreeBuildUsed };
}

/**
 * Add guild to early adopters and reset the used flag so /setup run works once.
 * @param {string} guildId
 */
export function grantFreeBuildToGuild(guildId) {
  addEarlyAdopterGuild(guildId);
  const cfg = loadGuildConfig(guildId);
  const { earlyAdopterFreeBuildUsed: _removed, ...rest } = cfg;
  saveGuildConfig(guildId, rest);
}
