import http from "http";
import { log } from "./logger.js";
import { handleKofiWebhookRequest } from "./billing/kofiWebhook.js";
import { sendJson } from "./http.js";

let _client = null;

/**
 * Start a lightweight HTTP server for Railway/Fly health checks and Ko-fi webhooks.
 * - GET /health → 200 { status: "ok", uptime }
 * - GET /status → 200 { guilds, uptime, model }
 * - POST /webhooks/kofi → Ko-fi payment webhook
 * @param {import('discord.js').Client} client Discord client (for guild count)
 * @param {number} [port] Defaults to PORT env var or 3000
 */
export function startHealthServer(client, port = Number(process.env.PORT) || 3000) {
  _client = client;

  const server = http.createServer(async (req, res) => {
    const url = req.url?.split("?")[0];

    if (url === "/webhooks/kofi") {
      await handleKofiWebhookRequest(req, res, {
        onPurchase: async (purchase) => {
          try {
            const { postPurchase } = await import("./ops.js");
            postPurchase({
              userId: purchase.email || "kofi",
              skuId: "kofi-subscription",
              skuLabel: "JustTheHelper $1.99/mo (Ko-fi)",
              guildId: purchase.guildId,
              extraFields: [
                { name: "Amount", value: `${purchase.amount || "?"} ${purchase.currency || ""}`.trim(), inline: true },
                { name: "Renewal", value: purchase.renewal ? "yes" : "no", inline: true },
              ],
            });
          } catch (err) {
            log(`Ko-fi purchase analytics failed: ${err.message}`);
          }
        },
      });
      return;
    }

    if (url === "/health") {
      sendJson(res, 200, { status: "ok", uptime: process.uptime() });
      return;
    }

    if (url === "/status") {
      sendJson(res, 200, {
        status: "ok",
        uptime: Math.floor(process.uptime()),
        guilds: _client?.guilds?.cache?.size ?? 0,
        env: process.env.NODE_ENV || "development",
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  server.on("error", (err) => log(`Health server error: ${err.message}`));
  server.listen(port, "0.0.0.0", () => {
    log(`HTTP server on :${port} — GET /health, POST /webhooks/kofi`);
  });
  return server;
}
