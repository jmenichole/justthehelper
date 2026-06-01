// Owner-only: registered as User Install (see ownerCommands.js). Handler checks BOT_OWNER_ID.
import { SlashCommandBuilder, REST, Routes } from "discord.js";
import { asOwnerUserCommand } from "./commands/ownerCommands.js";
import { log } from "./logger.js";
import { grantFreeBuildToGuild, getEarlyAdopterStatus } from "./earlyAdopters.js";

const grantCommandBuilder = new SlashCommandBuilder()
  .setName("grant")
  .setDescription("🎁 [Bot Owner] Grant a free build or Pro access")
  .addSubcommand((sub) =>
    sub
      .setName("free-build")
      .setDescription("One free full /setup run for a server")
      .addStringOption((opt) =>
        opt
          .setName("guild_id")
          .setDescription("Server ID (Developer Mode → Copy Server ID)")
          .setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("notify")
          .setDescription("DM the server owner (default: yes)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("pro")
      .setDescription("Pro Builder subscription (Discord test entitlement)")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to grant Pro").setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("notify")
          .setDescription("DM the user (default: yes)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("revoke-pro")
      .setDescription("Remove a test Pro entitlement from a user")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to revoke").setRequired(true)
      )
  )
  ;

export const GrantCommandData = asOwnerUserCommand(grantCommandBuilder.toJSON());

function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return ownerId && userId === ownerId;
}

function supportLink() {
  return process.env.SUPPORT_SERVER_INVITE || "https://discord.gg/NEePze3rZd";
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} userId
 */
async function createProTestEntitlement(client, userId) {
  const skuId = process.env.SUBSCRIPTION_SKU_ID;
  if (!skuId) throw new Error("SUBSCRIPTION_SKU_ID is not set in env.");

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const appId = client.application.id;

  return rest.post(Routes.entitlements(appId), {
    body: {
      sku_id: skuId,
      owner_id: userId,
      owner_type: 2
    }
  });
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} userId
 */
async function revokeProTestEntitlements(client, userId) {
  const skuId = process.env.SUBSCRIPTION_SKU_ID;
  if (!skuId) throw new Error("SUBSCRIPTION_SKU_ID is not set in env.");

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const appId = client.application.id;

  const list = await rest.get(Routes.entitlements(appId), {
    query: new URLSearchParams({
      user_id: userId,
      sku_ids: skuId,
      exclude_ended: "true"
    })
  });

  const items = Array.isArray(list) ? list : [];
  let removed = 0;
  for (const ent of items) {
    await rest.delete(Routes.entitlement(appId, ent.id));
    removed++;
  }
  return removed;
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Interaction} interaction
 */
export async function handleGrantInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "grant") return;

  if (!isBotOwner(interaction.user.id)) {
    return interaction.reply({
      ephemeral: true,
      content: "❌ Owner only — set `BOT_OWNER_ID` in env to your Discord user ID."
    });
  }

  const sub = interaction.options.getSubcommand();
  const notify = interaction.options.getBoolean("notify") ?? true;

  if (sub === "free-build") {
    const guildId = interaction.options.getString("guild_id").trim();
    if (!/^\d{17,20}$/.test(guildId)) {
      return interaction.reply({
        ephemeral: true,
        content: "❌ Invalid `guild_id` — must be a numeric server ID."
      });
    }

    await interaction.deferReply({ ephemeral: true });

    grantFreeBuildToGuild(guildId);
    const status = getEarlyAdopterStatus(guildId);
    const guild = await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return interaction.editReply({
        content: [
          `✅ **Free build granted** for server \`${guildId}\`.`,
          status.hasFreeBuildLeft
            ? "Owner can run `/setup run` once after the bot is invited."
            : "Ready for `/setup run` once the bot is in the server.",
          notify
            ? "\n⚠️ Could not notify — bot is not in that server (no owner DM)."
            : ""
        ].join("\n")
      });
    }

    let notifyResult = "";
    if (notify) {
      try {
        const owner = await guild.fetchOwner();
        await owner.send(
          [
            "🎁 **You've been granted a free server build** on **JustTheBuilder**.",
            "",
            `Server: **${guild.name}**`,
            "",
            "As server owner, run:",
            "`/setup run`",
            "",
            "You'll get a DM interview, then a full AI build (channels, roles, rules, FAQ, embeds).",
            "",
            `Questions? ${supportLink()}`
          ].join("\n")
        );
        notifyResult = `\n📬 DM sent to **${owner.user.tag}**.`;
      } catch (err) {
        notifyResult = `\n⚠️ Could not DM owner: ${err.message}`;
        log(`grant free-build DM failed: ${err.message}`);
      }
    }

    return interaction.editReply({
      content: [
        `✅ **Free build granted** for **${guild.name}** (\`${guildId}\`).`,
        status.hasFreeBuildLeft
          ? "They can run `/setup run` once (owner only)."
          : "Ready for `/setup run`.",
        notifyResult
      ].join("\n")
    });
  }

  if (sub === "pro") {
    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const ent = await createProTestEntitlement(client, user.id);
      let notifyResult = "";
      if (notify) {
        try {
          await user.send(
            [
              "💎 **You've been granted Pro Builder** on **JustTheBuilder**.",
              "",
              "Unlocked for you:",
              "• Unlimited `/setup run` builds",
              "• Fast-track presets (`gaming`, `crypto`, etc.)",
              "• `/setup edit-message` on servers you build",
              "",
              "Run `/setup run` in any server **you own** to start.",
              "",
              `Support: ${supportLink()}`
            ].join("\n")
          );
          notifyResult = "\n📬 User notified by DM.";
        } catch (err) {
          notifyResult = `\n⚠️ Could not DM user: ${err.message}`;
        }
      }

      return interaction.editReply({
        content: [
          `✅ **Pro granted** to **${user.tag}** (\`${user.id}\`).`,
          ent?.id ? `Entitlement: \`${ent.id}\`` : "",
          "_They may need to restart Discord for entitlements to refresh._",
          notifyResult
        ]
          .filter(Boolean)
          .join("\n")
      });
    } catch (err) {
      log(`grant pro failed: ${err.message}`);
      return interaction.editReply({
        content: `❌ Failed to grant Pro: ${err.message}\n_Check SUBSCRIPTION_SKU_ID and Developer Portal monetization._`
      });
    }
  }

  if (sub === "revoke-pro") {
    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });
    try {
      const removed = await revokeProTestEntitlements(client, user.id);
      return interaction.editReply({
        content:
          removed > 0
            ? `✅ Removed **${removed}** Pro entitlement(s) from **${user.tag}**.`
            : `ℹ️ No active Pro entitlements found for **${user.tag}**.`
      });
    } catch (err) {
      log(`revoke pro failed: ${err.message}`);
      return interaction.editReply({
        content: `❌ Revoke failed: ${err.message}`
      });
    }
  }
}
