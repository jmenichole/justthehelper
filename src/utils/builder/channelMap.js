/**
 * Stable channel map key (category + name avoids duplicate channel name collisions).
 * @param {string} categoryName
 * @param {string} channelName
 */
export function channelMapKey(categoryName, channelName) {
  return `${categoryName}/${channelName}`;
}

/**
 * Resolve a channel id from the map (composite key first, then legacy bare name).
 * @param {Object} channelMap
 * @param {string} categoryName
 * @param {string} channelName
 */
export function resolveChannelId(channelMap, categoryName, channelName) {
  const composite = channelMapKey(categoryName, channelName);
  if (channelMap[composite]) return channelMap[composite];
  return channelMap[channelName];
}

function channelNameSlug(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Map blueprint channels to existing guild channels (for post-messages without recreating).
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint
 */
export function buildChannelMapFromGuild(guild, blueprint) {
  const map = {};
  for (const categoryName of Object.keys(blueprint.categories || {})) {
    for (const chDef of blueprint.categories[categoryName]) {
      const slug = channelNameSlug(chDef.name);
      const channel = guild.channels.cache.find((c) => {
        if (!c.isTextBased?.()) return false;
        const n = c.name.toLowerCase();
        return n === slug || n.endsWith(`│${slug}`) || n.endsWith(slug) || n.includes(slug);
      });
      if (channel) map[channelMapKey(categoryName, chDef.name)] = channel.id;
    }
  }
  return map;
}
