/**
 * Pure helpers for the load test (scripts/loadtest/run.mjs): the safety checks, the signed test
 * payload, the arrival-rate ramp and the numbers. No network, no secrets, no dependencies, so
 * tests/loadtest.test.ts can pin them.
 */
import { createHmac } from "node:crypto";

/** The live site and everything under it. Never a target, whatever the allow list says. */
export const FORBIDDEN_HOSTS = ["givezy.co.za"];

/** Hosts on this machine need no approval note; anything else needs --approved-by. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

const hostMatches = (host, rule) => host === rule || host.endsWith(`.${rule}`);

/**
 * A host as the browser would name it: lower case, every trailing dot gone ("givezy.co.za.." is givezy.co.za),
 * and an allow-list entry put through the same parser as the base address (review 24/11/2026).
 */
export function normaliseHost(h) {
  let host = String(h ?? "").trim();
  try {
    host = new URL(`http://${host}`).hostname;
  } catch {
    /* not a host: compared as typed, so it matches nothing */
  }
  return host.toLowerCase().replace(/\.+$/, "");
}

/**
 * Decide whether a run may start. Returns { ok: true, url, host, local } or { ok: false, reason }.
 * The base address must be passed on purpose (no default), must be on the operator's own allow list,
 * must never be the live site, and (when it is not this machine) needs a named approver.
 * @param {{ baseUrl?: string, allowHosts?: string[], approvedBy?: string }} o
 */
export function checkTarget({ baseUrl, allowHosts, approvedBy }) {
  if (!baseUrl) return { ok: false, reason: "No base URL. Pass --base-url explicitly; there is no default." };
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return { ok: false, reason: `"${baseUrl}" is not a web address.` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "Only http and https addresses are allowed." };
  const host = normaliseHost(url.hostname);
  if (FORBIDDEN_HOSTS.some((f) => hostMatches(host, f))) return { ok: false, reason: `${host} is the live site. This test never runs against it.` };
  const raw = (allowHosts ?? []).map((h) => String(h).trim()).filter(Boolean);
  if (raw.some((a) => a.includes("*"))) return { ok: false, reason: "No wildcards in the allow list. Name each host." };
  const allow = raw.map(normaliseHost).filter(Boolean);
  if (!allow.length) return { ok: false, reason: "No allow list. Pass --allow-host <host> for each host you mean to test." };
  if (allow.some((a) => FORBIDDEN_HOSTS.some((f) => hostMatches(a, f)))) return { ok: false, reason: "The live site cannot be on the allow list." };
  if (!allow.includes(host)) return { ok: false, reason: `${host} is not on the allow list (${allow.join(", ")}).` };
  const local = LOOPBACK_HOSTS.includes(host) || LOOPBACK_HOSTS.includes(url.hostname);
  if (!local && !approvedBy) return { ok: false, reason: `${host} is not on this machine. Pass --approved-by "<name, date>" once Yehuda has said go.` };
  return { ok: true, url, host, local };
}

/** Same signature the test gateway checks (src/lib/gateway/test-gateway.ts, testGatewaySign): HMAC-SHA256 hex of the raw body. */
export function signTestPayload(body, secret) {
  if (!secret) throw new Error("TEST_GATEWAY_SECRET is not set.");
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** A signed test-gateway delivery for a reference. Returns { body, headers }. */
export function signedWebhook({ id, reference, amountCents, outcome = "success", secret }) {
  const body = JSON.stringify({ id, outcome, reference, amount: amountCents });
  return { body, headers: { "content-type": "application/json", "x-test-signature": signTestPayload(body, secret) } };
}

/** The rate (requests per second) at a moment: linear ramp up, then steady. */
export function rateAt(elapsedSec, { targetRate, rampSec }) {
  if (rampSec <= 0 || elapsedSec >= rampSec) return targetRate;
  return Math.max(0, targetRate * (elapsedSec / rampSec));
}

/** How many requests a whole run will send (area under the ramp, then the steady part). */
export function plannedRequests({ targetRate, rampSec, durationSec }) {
  const ramp = Math.min(rampSec, durationSec);
  return Math.round((targetRate * ramp) / 2 + targetRate * (durationSec - ramp));
}

export function percentile(sortedMs, p) {
  if (!sortedMs.length) return null;
  const i = Math.min(sortedMs.length - 1, Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1));
  return sortedMs[i];
}

/** Numbers for one scenario from its samples [{ ms, status, ok, kind }]. */
export function summarise(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const byStatus = {};
  const byKind = {};
  for (const s of samples) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    if (s.kind) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
  }
  const failed = samples.filter((s) => !s.ok).length;
  const round = (n) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    requests: samples.length,
    failed,
    errorPct: samples.length ? Math.round((failed / samples.length) * 10000) / 100 : 0,
    p50: round(percentile(ms, 50)),
    p95: round(percentile(ms, 95)),
    p99: round(percentile(ms, 99)),
    max: round(ms.length ? ms[ms.length - 1] : null),
    byStatus,
    byKind,
  };
}

/**
 * Compare against thresholds the operator passed. Anything not passed is "not set", never a pass.
 * @param {any} summary
 * @param {{ maxErrorPct?: number, maxP95Ms?: number }} limits
 */
export function judge(summary, { maxErrorPct, maxP95Ms }) {
  return [
    maxErrorPct === undefined
      ? { name: "error rate", state: "not set" }
      : { name: "error rate", state: summary.errorPct <= maxErrorPct ? "pass" : "fail", limit: maxErrorPct, got: summary.errorPct },
    maxP95Ms === undefined
      ? { name: "p95 time", state: "not set" }
      : { name: "p95 time", state: summary.p95 !== null && summary.p95 <= maxP95Ms ? "pass" : "fail", limit: maxP95Ms, got: summary.p95 },
  ];
}

/** "30s", "5m", "90" (seconds) to seconds. */
export function parseDuration(text) {
  const m = /^(\d+(?:\.\d+)?)(s|m)?$/.exec(String(text ?? "").trim());
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === "m" ? 60 : 1));
}

/**
 * The run's verdict (review 24/11/2026). "pass" only when both limits were given and met; one missing is "partial",
 * none "not judged"; a stopped run, a failed check or requests not sent is "fail".
 */
export function verdictOf({ halted, anyFail, dropped, thresholds }) {
  if (halted || anyFail || dropped > 0) return "fail";
  const err = thresholds.maxErrorPct !== undefined;
  const p95 = thresholds.maxP95Ms !== undefined;
  return err && p95 ? "pass" : err || p95 ? "partial" : "not judged";
}
