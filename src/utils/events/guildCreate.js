import { postGuildInstall } from "../ops.js";

export async function handleGuildCreate(guild, client) {
  try {
    postGuildInstall(guild);
  } catch (err) {
    console.error("guildCreate handler failed:", err);
  }
}
