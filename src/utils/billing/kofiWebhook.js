import { readRequestBody, sendJson } from "../http.js";
import { applyKofiPayment, parseKofiWebhookBody, verifyKofiPayload } from "../billing/kofi.js";
import { buildGuildCodeIndex } from "../billing/guildCodes.js";
import { log } from "../logger.js";

export async function handleKofiWebhookRequest(req, res, { onPurchase } = {}) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const rawBody = await readRequestBody(req);
    const payload = parseKofiWebhookBody(rawBody);
    const verified = verifyKofiPayload(payload);
    if (!verified.ok) {
      sendJson(res, verified.reason === "invalid_token" ? 403 : 503, { error: verified.reason });
      return;
    }

    const result = applyKofiPayment(payload, buildGuildCodeIndex());
    if (result.applied) {
      onPurchase?.({
        guildId: result.guildId,
        email: payload.email,
        amount: payload.amount,
        currency: payload.currency,
        renewal: result.renewal,
        transactionId: payload.kofi_transaction_id,
      });
    } else if (result.reason === "guild_not_found") {
      log(`Ko-fi payment received but no guild matched (tx ${payload.kofi_transaction_id})`);
    }

    sendJson(res, 200, { ok: true, applied: result.applied, reason: result.reason || null });
  } catch (err) {
    log(`Ko-fi webhook error: ${err.message}`);
    sendJson(res, 400, { error: "invalid_payload" });
  }
}
