import { startOnboarding } from "../onboarding/flow.js";
import { logStaffUsage } from "../staffLog.js";

export async function handleGuildCreate(guild, client) {
  try {
    const owner = await guild.fetchOwner();
    logStaffUsage(client, {
      action: "Bot added to server",
      guild,
      user: owner.user,
      color: 0x2ecc71,
      detail: `Members: ${guild.memberCount ?? "?"}`
    });

    await startOnboarding(owner.user, guild, client);

  } catch (err) {
    console.error("DM failed:", err);
    guild.systemChannel?.send(
      "⚠️ I couldn't DM the server owner. Please enable DMs and re-add me."
    );
  }
}
