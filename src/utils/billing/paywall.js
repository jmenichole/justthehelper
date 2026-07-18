import { kofiPageUrl, isKofiConfigured } from "./kofi.js";

export function billingProvider() {
  const explicit = (process.env.BILLING_PROVIDER || "").trim().toLowerCase();
  if (explicit === "kofi" || explicit === "discord" || explicit === "both") return explicit;
  if (isKofiConfigured()) return "kofi";
  if (process.env.HELPER_SKU_ID || process.env.SUBSCRIPTION_SKU_ID) return "discord";
  return "none";
}

export function usesKofiBilling() {
  const provider = billingProvider();
  return provider === "kofi" || provider === "both";
}

export function usesDiscordBilling() {
  const provider = billingProvider();
  return provider === "discord" || provider === "both";
}

export function ticketPaywallMessage() {
  if (usesKofiBilling()) {
    const page = kofiPageUrl();
    const link = page ? `\n\nSubscribe: ${page}` : "";
    return (
      "Tickets require **JustTheHelper** ($1.99/mo) for this server. " +
      "An admin should run `/subscribe` to get a server link code, pay on Ko-fi, and include that code in the payment message." +
      link
    );
  }

  return (
    "Tickets require **JustTheHelper** ($1.99/mo) for this server. " +
    "An admin can subscribe in the app's store / SKU page."
  );
}
