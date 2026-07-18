import fs from "fs";
import path from "path";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const baseDir = path.resolve("data", "guilds");

function randomCodeSuffix(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function ensureGuildLinkCode(guildId) {
  const cfg = loadGuildConfig(guildId);
  if (cfg.kofiLinkCode) return cfg.kofiLinkCode;
  const code = `JTH-${randomCodeSuffix()}`;
  saveGuildConfig(guildId, { ...cfg, kofiLinkCode: code });
  return code;
}

export function buildGuildCodeIndex() {
  const index = {};
  if (!fs.existsSync(baseDir)) return index;

  for (const file of fs.readdirSync(baseDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(baseDir, file), "utf-8"));
      if (data.kofiLinkCode) {
        index[String(data.kofiLinkCode).toUpperCase()] = file.replace(/\.json$/, "");
      }
    } catch {
      // skip invalid guild config
    }
  }
  return index;
}

export function findGuildIdByLinkCode(code, index = buildGuildCodeIndex()) {
  if (!code) return null;
  return index[String(code).toUpperCase()] || null;
}
