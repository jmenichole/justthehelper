import http from "http";
import { log } from "./logger.js";

let _client = null;

/**
 * Start a lightweight HTTP server for Railway health checks.
 * - GET /health → 200 { status: "ok", uptime }
 * - GET /status → 200 { guilds, uptime, model }
 * @param {import('discord.js').Client} client Discord client (for guild count)
 * @param {number} [port] Defaults to PORT env var or 3000
 */
export function startHealthServer(client, port = Number(process.env.PORT) || 3000) {
  _client = client;

  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.url === "/health") {
      res.writeHead(200);
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else if (req.url === "/status") {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: "ok",
        uptime: Math.floor(process.uptime()),
        guilds: _client?.guilds?.cache?.size ?? 0,
        env: process.env.NODE_ENV || "development"
      }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.on("error", (err) => log(`Health server error: ${err.message}`));
  server.listen(port, "0.0.0.0", () => log(`Health server running on :${port} — GET /health`));
  return server;
}
