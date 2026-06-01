import { log } from "../logger.js";
import { sendProgress } from "../progress.js";
import { buildStyledEmbed } from "./embedFactory.js";
import { resolveChannelId, buildChannelMapFromGuild } from "./channelMap.js";

function shouldPinMessage(chDef) {
  if (chDef.pinMessage === false) return false;
  if (chDef.pinMessage === true) return true;
  return /^rules?$/i.test(chDef.name || "");
}

/**
 * Post any configured channel messages (rules/about/etc) as embeds.
 * @param {import('discord.js').Guild} guild
 * @param {Object} channelMap
 * @param {Object} blueprint
 * @param {import('discord.js').User} [ownerUser]
 * @returns {Promise<{posted:string[], failed:string[], pinned:string[]}>}
 */
export async function postMessages(guild, channelMap, blueprint, ownerUser) {
  const posted = [];
  const failed = [];
  const pinned = [];

  for (const categoryName of Object.keys(blueprint.categories)) {
    for (const chDef of blueprint.categories[categoryName]) {
      if (!chDef.message) continue;

      const label = `${categoryName}/${chDef.name}`;
      try {
        const channelId = resolveChannelId(channelMap, categoryName, chDef.name);
        if (!channelId) {
          const errText = `channel not found in map`;
          failed.push(`${label}: ${errText}`);
          log(`Failed to post message in ${label}: ${errText}`);
          continue;
        }

        const channel =
          guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId));
        if (!channel?.isTextBased?.()) {
          const errText = "channel is not text-based";
          failed.push(`${label}: ${errText}`);
          log(`Failed to post message in ${label}: ${errText}`);
          continue;
        }

        const embed = buildStyledEmbed(chDef.message, blueprint.style, blueprint.branding);
        const sent = await channel.send({ embeds: [embed] });
        posted.push(label);

        if (/create-ticket|open-ticket|support-ticket/i.test(chDef.name || "")) {
          try {
            const { getTicketConfig } = await import("../tickets/config.js");
            const { deployTicketPanelForGuild } = await import("../tickets/handler.js");
            const tcfg = blueprint.tickets?.enabled ? blueprint.tickets : getTicketConfig(guild.id);
            if (tcfg?.enabled) {
              await deployTicketPanelForGuild(guild, guild.client, tcfg);
            }
          } catch (panelErr) {
            log(`Ticket panel in ${label}: ${panelErr.message}`);
          }
        }

        if (shouldPinMessage(chDef)) {
          try {
            await sent.pin();
            pinned.push(label);
          } catch (pinErr) {
            log(`Pin failed for ${label}: ${pinErr.message}`);
            if (ownerUser) {
              await sendProgress(
                ownerUser,
                `⚠️ Posted embed in **#${chDef.name}** but could not pin it: ${pinErr.message}`
              );
            }
          }
        }
      } catch (err) {
        failed.push(`${label}: ${err.message}`);
        log(`Failed to post message in ${label}: ${err.message}`);
      }
    }
  }

  if (ownerUser) {
    if (posted.length) {
      const pinNote = pinned.length ? ` (${pinned.length} pinned)` : "";
      await sendProgress(ownerUser, `📝 Posted embeds: ${posted.join(", ")}${pinNote}`);
    }
    if (failed.length) {
      await sendProgress(
        ownerUser,
        `⚠️ Could not post embeds:\n${failed.map((f) => `• ${f}`).join("\n")}\n\nCheck that the bot can **Send Messages** and **Embed Links** in those channels.`
      );
    }
  }

  return { posted, failed, pinned };
}

/**
 * Post blueprint embeds into channels that already exist (no recreate).
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint
 * @param {import('discord.js').User} [ownerUser]
 */
export async function postMessagesToExistingChannels(guild, blueprint, ownerUser) {
  const channelMap = buildChannelMapFromGuild(guild, blueprint);
  return postMessages(guild, channelMap, blueprint, ownerUser);
}
