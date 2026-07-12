/**
 * Discord monetization / access helpers.
 */

export function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return Boolean(ownerId && userId === ownerId);
}

function helperSkuId() {
  return process.env.HELPER_SKU_ID || process.env.SUBSCRIPTION_SKU_ID || "";
}

function asList(entitlements) {
  if (!entitlements) return [];
  return typeof entitlements.values === "function"
    ? [...entitlements.values()]
    : [...entitlements];
}

/** Pure check against an entitlement list (for tests + interaction.entitlements). */
export function guildHasHelperSubscriptionSync(guildId, entitlements) {
  const sku = helperSkuId();
  if (!sku || !guildId) return false;
  return asList(entitlements).some(
    (e) => e.skuId === sku && String(e.guildId) === String(guildId) && !e.consumed
  );
}

/**
 * True if guild may use tickets.
 * Owner bypass is for *user* actions in ticket admin flows — pass userId when checking commands.
 */
export async function canUseTickets(client, { guildId, userId, interactionEntitlements }) {
  if (userId && isBotOwner(userId)) return { allowed: true, reason: "owner" };
  if (guildHasHelperSubscriptionSync(guildId, interactionEntitlements)) {
    return { allowed: true, reason: "interaction" };
  }
  const sku = helperSkuId();
  if (!sku) return { allowed: false, reason: "sku_unconfigured" };
  try {
    const ents = await client.application.entitlements.fetch({
      guildId,
      excludeEnded: true,
      skuIds: [sku],
    });
    if (ents.some((e) => e.skuId === sku)) return { allowed: true, reason: "fetch" };
  } catch {
    return { allowed: false, reason: "fetch_failed" };
  }
  return { allowed: false, reason: "not_entitled" };
}
