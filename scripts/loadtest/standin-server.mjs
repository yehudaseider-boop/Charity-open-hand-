#!/usr/bin/env node
/**
 * A tiny stand-in for the website, only for trying the load test script on this machine. It is NOT the
 * app: it answers the same addresses with made-up work and a small random delay, checks the webhook
 * signature the way the test gateway does, and keeps nothing.
 *
 *   TEST_GATEWAY_SECRET=local-secret LOADTEST_COOKIE=local-cookie node scripts/loadtest/standin-server.mjs --port 4010
 *   add --bad-redirect to make checkout answer with an outside payment address (the script must stop).
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { signTestPayload } from "./lib.mjs";

const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1] || 4010);
const badRedirect = argv.includes("--bad-redirect");
const secret = process.env.TEST_GATEWAY_SECRET ?? "local-secret";
const cookie = process.env.LOADTEST_COOKIE ?? "local-cookie";
const pending = new Set();
const delay = (min, spread) => new Promise((r) => setTimeout(r, min + Math.random() * spread));

const readBody = (req) => new Promise((resolve) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => resolve(b));
});

createServer(async (req, res) => {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const path = new URL(req.url, "http://x").pathname;
  if (req.method === "POST" && path === "/api/app/checkout") {
    const body = JSON.parse((await readBody(req)) || "{}");
    await delay(15, 25);
    if (!body.slug || !body.details?.email) return send(400, { ok: false, message: "Check the details and try again." });
    const reference = randomUUID();
    pending.add(reference);
    const host = badRedirect ? "https://pay.example.invalid" : `http://${req.headers.host}`;
    return send(200, { ok: true, redirectUrl: `${host}/test-gateway?reference=${reference}`, reference, token: "t" });
  }
  if (req.method === "POST" && path === "/api/webhooks/test") {
    const raw = await readBody(req);
    if (req.headers["x-test-signature"] !== signTestPayload(raw, secret)) return send(401, "Bad signature");
    await delay(10, 20);
    const { reference } = JSON.parse(raw);
    pending.delete(reference);
    return send(200, { ok: true });
  }
  if (req.method === "GET" && path.startsWith("/charity-admin/")) {
    if (req.headers.cookie !== cookie) return send(307, "", { location: "/login" });
    await delay(30, 60);
    return send(200, "<html>dashboard</html>", { "content-type": "text/html" });
  }
  send(404, "Not found");
}).listen(port, "127.0.0.1", () => console.log(`Stand-in listening on http://127.0.0.1:${port}`));
