import { ChannelType, PermissionFlagsBits } from "discord.js";
import { applyChannelPermissions } from "./permissions.js";
import { channelMapKey } from "./channelMap.js";
import { log } from "../logger.js";
import { sendProgress } from "../progress.js";

/**
 * Format a channel name into lowercase-dash style with optional emoji prefix.
 * Avoids duplicate emoji prefix if already present.
 * @param {string} rawName Original name from blueprint
 * @param {Object} style Style object (provides emojiPrefix)
 * @param {Object} [branding] Branding object (may override emoji prefix)
 * @returns {string} Formatted channel name
 */
export function formatChannelName(rawName, style, branding) {
  if (!rawName) return rawName;
  const base = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const emojiPrefix = branding?.emoji || style?.emojiPrefix || "";
  let name = base;
  if (emojiPrefix) {
    // Avoid duplicate prefix
    const cleaned = name.replace(new RegExp(`^${emojiPrefix}`), "");
    name = `${emojiPrefix}│${cleaned}`;
  }
  return name;
}

/**
 * Resolve blueprint channel type string to discord.js ChannelType.
 * @param {Object} def
 */
function resolveChannelType(def) {
  switch (def.type) {
    case "voice": return ChannelType.GuildVoice;
    case "announcement": return ChannelType.GuildAnnouncement;
    case "media": return ChannelType.GuildText; // could become dedicated type later
    case "stage": return ChannelType.GuildStageVoice;
    case "forum": return ChannelType.GuildForum;
    case "text":
    default: return ChannelType.GuildText;
  }
}

/**
 * Create categories & channels based on full blueprint (for access to style & private).
 */
/**
 * Create categories & channels based on blueprint.
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint
 * @param {Object} roleMap
 * @param {import('discord.js').User} [progressUser]
 * @param {Object} [options]
 * @param {boolean} [options.includeTopics=true] Set channel topics from blueprint
 * @param {boolean} [options.includeWebhooks=true] Create webhooks from blueprint
 * @param {boolean} [options.skipPermissions=false] Skip permission overwrites/category presets/thread locks (free structure mode)
 */
export async function createChannels(guild, blueprint, roleMap, progressUser, options = {}) {
  const includeTopics = options.includeTopics !== false;
  const includeWebhooks = options.includeWebhooks !== false;
  const skipPermissions = options.skipPermissions === true;

  const { categories, style, branding } = blueprint;
  const channelMap = {};
  const categoryPrivacy = blueprint.categoryPrivacy || {};
  const orderingBuckets = {}; // categoryName -> [{channel, order}]

  for (const categoryName of Object.keys(categories)) {
    try {
      const formattedCategoryName = formatChannelName(categoryName, { emojiPrefix: "" }, null); // keep category clean (no branding for categories)
      const category = await guild.channels.create({
        name: formattedCategoryName,
        type: ChannelType.GuildCategory
      });

      // Category privacy preset (inherits to channels unless overridden)
      const catPreset = categoryPrivacy[categoryName];
      if (catPreset && !skipPermissions) {
        try { await applyCategoryPreset(category, catPreset, roleMap); } catch (err) { log(`Category preset failed (${categoryName}): ${err.message}`); }
      }

      for (const chDef of categories[categoryName]) {
        const originalName = chDef.name || chDef;
        const channelName = formatChannelName(originalName, style, branding);
        try {
          const createOpts = {
            name: channelName,
            type: resolveChannelType(chDef),
            parent: category.id,
            topic: includeTopics ? (chDef.topic || undefined) : undefined
          };
          if (createOpts.type === ChannelType.GuildForum && chDef.defaultAutoArchiveDuration) {
            createOpts.defaultAutoArchiveDuration = chDef.defaultAutoArchiveDuration;
          }
          const channel = await guild.channels.create(createOpts);
          channelMap[channelMapKey(categoryName, originalName)] = channel.id;
          if (!skipPermissions) {
            await applyChannelPermissions(channel, chDef, roleMap);
          }

          // Thread lock - remove thread creation for everyone
          if (chDef.threadsLocked && !skipPermissions) {
            const everyoneId = guild.roles.everyone.id;
            await channel.permissionOverwrites.edit(everyoneId, {
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
              SendMessagesInThreads: false
            }).catch(()=>{});
          }

          if (progressUser) await sendProgress(progressUser, `✅ Created ${channelName}`);

          // Ordering bucket
          if (typeof chDef.order === 'number') {
            if (!orderingBuckets[categoryName]) orderingBuckets[categoryName] = [];
            orderingBuckets[categoryName].push({ channel, order: chDef.order });
          }

          // Webhooks
          if (includeWebhooks && blueprint.webhooks && blueprint.webhooks[originalName]) {
            const whDef = blueprint.webhooks[originalName];
            try {
              await channel.createWebhook({ name: whDef.name || originalName, avatar: whDef.avatar || undefined });
              if (progressUser) await sendProgress(progressUser, `🔗 Webhook created for ${channelName}`);
            } catch (err) {
              log(`Webhook create failed (${channelName}): ${err.message}`);
            }
          }
        } catch (err) {
          log(`Channel create failed (${channelName}): ${err.message}`);
        }
      }
    } catch (err) {
      log(`Category create failed (${categoryName}): ${err.message}`);
    }
  }

  // Apply ordering
  for (const [catName, items] of Object.entries(orderingBuckets)) {
    items.sort((a,b)=>a.order - b.order);
    for (let i=0;i<items.length;i++) {
      const channel = items[i].channel;
      try { await channel.setPosition(i); } catch {}
    }
  }

  return { channelMap };
}

/**
 * Map blueprint-defined channels to already-existing guild channels by formatted name.
 * Used by polish mode to avoid recreating channels built during the free structure pass.
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint
 * @returns {Promise<Object>} Map of channelMapKey -> channel id
 */
export async function mapExistingChannelsFromBlueprint(guild, blueprint) {
  const channelMap = {};
  for (const [categoryName, list] of Object.entries(blueprint.categories || {})) {
    for (const chDef of list) {
      const originalName = typeof chDef === "string" ? chDef : chDef.name;
      const formatted = formatChannelName(originalName, blueprint.style, blueprint.branding);
      const found = guild.channels.cache.find(
        (c) => c.name === formatted || c.name === originalName?.toLowerCase?.()
      );
      if (found) channelMap[channelMapKey(categoryName, originalName)] = found.id;
    }
  }
  return channelMap;
}

/**
 * Apply topics & permission overwrites to existing channels (polish pass on top of free structure).
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint
 * @param {Object} channelMap Map of channelMapKey -> channel id (from mapExistingChannelsFromBlueprint)
 * @param {Object} roleMap
 * @param {import('discord.js').User} [progressUser]
 */
export async function applyTopicsAndPermissions(guild, blueprint, channelMap, roleMap, progressUser) {
  for (const [categoryName, list] of Object.entries(blueprint.categories || {})) {
    for (const chDef of list) {
      if (typeof chDef === "string") continue;
      const originalName = chDef.name || chDef;
      const id = channelMap[channelMapKey(categoryName, originalName)];
      if (!id) continue;
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (!channel) continue;
      if (chDef.topic && typeof channel.setTopic === "function") {
        await channel.setTopic(chDef.topic).catch(() => {});
      }
      await applyChannelPermissions(channel, chDef, roleMap).catch(() => {});
      if (progressUser) await sendProgress(progressUser, `✨ Polished #${channel.name}`);
    }
  }
}

/**
 * Apply a category-level privacy preset by setting overwrites.
 * @param {import('discord.js').CategoryChannel} category
 * @param {string} preset Preset name (staff-private, mods-only, public-readonly)
 * @param {Object} roleMap Map of role name -> role id
 */
async function applyCategoryPreset(category, preset, roleMap) {
  const overwrites = [];
  const everyoneId = category.guild.roles.everyone.id;
  switch (preset) {
    case 'staff-private':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/admin|mod|staff|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
      }
      break;
    case 'mods-only':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/mod|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
      }
      break;
    case 'public-readonly':
      overwrites.push({ id: everyoneId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
      break;
    default:
      return;
  }
  if (overwrites.length) await category.permissionOverwrites.set(overwrites);
}

