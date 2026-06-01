/**
 * Discord monetization / access helpers.
 */

export function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return Boolean(ownerId && userId === ownerId);
}

/**
 * Active Pro Builder subscription (not consumable basic pack).
 * @param {import('discord.js').Client} client
 * @param {string} userId
 * @param {import('discord.js').Collection|Array} [interactionEntitlements]
 */
export async function userHasProSubscription(client, userId, interactionEntitlements) {
  const subSkuId = process.env.SUBSCRIPTION_SKU_ID;
  if (!subSkuId) return false;

  if (interactionEntitlements) {
    const list =
      typeof interactionEntitlements.values === "function"
        ? [...interactionEntitlements.values()]
        : [...interactionEntitlements];
    if (list.some((e) => e.skuId === subSkuId && !e.consumed)) return true;
  }

  try {
    const ents = await client.application.entitlements.fetch({
      userId,
      excludeEnded: true
    });
    return ents.some((e) => e.skuId === subSkuId);
  } catch {
    return false;
  }
}

/**
 * Support tickets: Pro subscribers + bot owner (always free).
 */
export async function canOpenSupportTicket(client, userId, interactionEntitlements) {
  if (isBotOwner(userId)) return { allowed: true, reason: "owner" };
  if (await userHasProSubscription(client, userId, interactionEntitlements)) {
    return { allowed: true, reason: "pro" };
  }
  return { allowed: false, reason: "pro_required" };
}
