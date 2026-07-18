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

function isActiveEntitlement(entitlement) {
  if (!entitlement || entitlement.consumed) return false;
  if (typeof entitlement.isActive === "function") return entitlement.isActive();
  if (entitlement.deleted) return false;
  if (entitlement.endsTimestamp && entitlement.endsTimestamp <= Date.now()) return false;
  return true;
}

/** True when an entitlement grants the Helper guild subscription SKU for this guild. */
export function matchesHelperGuildSubscription(guildId, entitlement, sku = helperSkuId()) {
  if (!sku || !guildId || !entitlement) return false;
  return (
    entitlement.skuId === sku &&
    String(entitlement.guildId) === String(guildId) &&
    isActiveEntitlement(entitlement)
  );
}

/** Pure check against an entitlement list (for tests + interaction.entitlements). */
export function guildHasHelperSubscriptionSync(guildId, entitlements) {
  const sku = helperSkuId();
  if (!sku || !guildId) return false;
  return asList(entitlements).some((e) => matchesHelperGuildSubscription(guildId, e, sku));
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
      guild: guildId,
      skus: [sku],
      excludeEnded: true,
      excludeDeleted: true,
    });
    if (guildHasHelperSubscriptionSync(guildId, ents)) {
      return { allowed: true, reason: "fetch" };
    }
  } catch {
    return { allowed: false, reason: "fetch_failed" };
  }
  return { allowed: false, reason: "not_entitled" };
}
