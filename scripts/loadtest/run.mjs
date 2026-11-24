#!/usr/bin/env node
/**
 * Givezy load test for the busy times. Plain Node (22+), no packages. Read docs/load-test.md first.
 *
 * It ramps simulated donors up to a target rate (requests per second, an open-loop arrival rate: new
 * requests keep coming even when the site is slow, like real donors) and reports the error rate and
 * response times for each scenario.
 *
 *   node scripts/loadtest/run.mjs --base-url https://<test-site> --allow-host <test-site-host> \
 *        --approved-by "Yehuda, dd/mm/yyyy" --scenario busy --rate 10 --duration 5m --ramp 1m \
 *        --charity-slug <slug> --charity-id <uuid>
 *
 * Scenarios: checkout, webhook, dashboard, receipts, busy (a weighted mix of the first three).
 *
 * Safety (all enforced before a single request is sent, see lib.mjs):
 *   - No default address. --base-url is required and must be on the --allow-host list.
 *   - givezy.co.za (and anything under it) is refused, even if listed.
 *   - Anything not on this machine also needs --approved-by.
 *   - Checkout start stops before the payment provider's page: the redirect address it returns is
 *     never opened, and if it is not the stand-in test payment page the whole run stops at once.
 *   - Webhooks are signed with the test gateway's own signature (TEST_GATEWAY_SECRET) and only the
 *     "test" gateway route is called, so they cannot reach a real gateway's route.
 *   - Secrets come from environment variables only: TEST_GATEWAY_SECRET (webhook), LOADTEST_COOKIE
 *     (a signed-in session cookie for the dashboard and receipts pages).
 *
 * It records real rows (pending donations, gateway events) in whatever database the target uses: aim
 * it only at a test site with a test database, never one holding real donors.
 */
import { randomUUID } from "node:crypto";
import { checkTarget, judge, parseDuration, plannedRequests, rateAt, signedWebhook, summarise, verdictOf } from "./lib.mjs";

const HELP = `Usage: node scripts/loadtest/run.mjs --base-url <url> --allow-host <host> [--allow-host <host> ...] [options]

Required
  --base-url <url>        The site to test. No default.
  --allow-host <host>     A host you mean to test (repeat for more). The base URL's host must be listed.
  --approved-by <text>    Required for any host that is not this machine, e.g. "Yehuda, 24/11/2026".

Options
  --scenario <name>       checkout | webhook | dashboard | receipts | busy (default busy)
  --rate <n>              Target requests per second at the top of the ramp (default 5)
  --duration <t>          Total time, e.g. 90, 90s, 5m (default 1m)
  --ramp <t>              Time to climb to the target (default 20s, or the whole run if shorter)
  --max-rate <n>          Refuse a --rate above this (default 50)
  --charity-slug <slug>   Charity that takes the test gifts (checkout)
  --charity-id <uuid>     Charity whose dashboard pages are read (dashboard, receipts)
  --gift-cents <n>        Gift size in cents (default 5000 = R50)
  --max-error-pct <n>     Fail the run above this error rate (not set unless given)
  --max-p95-ms <n>        Fail the run above this p95 time (not set unless given)
  --json <path>           Also write the summary as JSON
  --dry-run               Check everything and print the plan; send nothing
  --help

Environment: TEST_GATEWAY_SECRET (webhook), LOADTEST_COOKIE (dashboard, receipts). Never put them in a file.
`;

function parseArgs(argv) {
  const out = { allowHosts: [] };
  const flags = new Set(["dry-run", "help"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected "${a}". Try --help.`);
    const key = a.slice(2);
    if (flags.has(key)) {
      out[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${key} needs a value.`);
    if (key === "allow-host") out.allowHosts.push(value);
    else out[key] = value;
  }
  return out;
}

const fail = (msg, code = 2) => {
  console.error(`Refused: ${msg}`);
  process.exit(code);
};

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (e) {
  fail(e.message);
}
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const target = checkTarget({ baseUrl: args["base-url"], allowHosts: args.allowHosts, approvedBy: args["approved-by"] });
if (!target.ok) fail(target.reason);
const origin = target.url.origin;

const scenario = args.scenario ?? "busy";
if (!["checkout", "webhook", "dashboard", "receipts", "busy"].includes(scenario)) fail(`Unknown scenario "${scenario}".`);
const targetRate = Number(args.rate ?? 5);
const maxRate = Number(args["max-rate"] ?? 50);
if (!(targetRate > 0)) fail("--rate must be above zero.");
if (targetRate > maxRate) fail(`--rate ${targetRate} is above --max-rate ${maxRate}. Raise --max-rate on purpose if the approved run needs it.`);
const durationSec = parseDuration(args.duration ?? "1m");
if (!durationSec || durationSec < 1) fail("--duration must look like 90, 90s or 5m.");
const rampArg = args.ramp === undefined ? Math.min(20, durationSec) : parseDuration(args.ramp);
if (rampArg === null || rampArg > durationSec) fail("--ramp must look like 20s and be no longer than --duration.");
const rampSec = rampArg;
const giftCents = Number(args["gift-cents"] ?? 5000);
if (!Number.isInteger(giftCents) || giftCents < 100) fail("--gift-cents must be whole cents, at least 100.");
const thresholds = {
  maxErrorPct: args["max-error-pct"] === undefined ? undefined : Number(args["max-error-pct"]),
  maxP95Ms: args["max-p95-ms"] === undefined ? undefined : Number(args["max-p95-ms"]),
};

const uses = {
  checkout: scenario === "checkout" || scenario === "busy",
  webhook: scenario === "webhook" || scenario === "busy",
  dashboard: scenario === "dashboard" || scenario === "busy",
  receipts: scenario === "receipts",
};
if (uses.checkout && !args["charity-slug"]) fail("--charity-slug is needed for checkout.");
if ((uses.dashboard || uses.receipts) && !args["charity-id"]) fail("--charity-id is needed for the dashboard and receipts pages.");
const cookie = process.env.LOADTEST_COOKIE;
if ((uses.dashboard || uses.receipts) && !cookie) fail("Set LOADTEST_COOKIE (a signed-in session cookie for a test charity user). It is read from the environment only.");
const secret = process.env.TEST_GATEWAY_SECRET;
if (uses.webhook && !secret) fail("Set TEST_GATEWAY_SECRET (the test site's own value) to sign webhook receipts.");

/** What a donor does, with how often (weights only matter in the busy mix). */
const DASHBOARD_PAGES = ["", "/donations", "/donors", "/receipts", "/monthly", "/report"].map((p) => `/charity-admin/${args["charity-id"]}${p}`);
// Charity pages only: Givezy's own admin pages need an admin's cookie, which a run never uses (review 24/11/2026).
const RECEIPT_PAGES = [`/charity-admin/${args["charity-id"]}/receipts`];
const mix = scenario === "busy" ? [["checkout", 30], ["webhook", 20], ["dashboard", 50]] : [[scenario, 1]];

const plan = plannedRequests({ targetRate, rampSec, durationSec });
console.log(`Target ${origin} | scenario ${scenario} | up to ${targetRate}/s over ${rampSec}s ramp, ${durationSec}s total | about ${plan} requests`);
if (!target.local) console.log(`Approved by: ${args["approved-by"]}`);
if (args["dry-run"]) {
  console.log("Dry run: checks passed, nothing sent.");
  process.exit(0);
}

const samples = Object.fromEntries(["checkout", "webhook", "dashboard", "receipts"].map((k) => [k, []]));
const references = []; // gifts the checkout scenario started: the webhook scenario confirms these
let seq = 0;
let halted = null;
let inFlight = 0;
let dropped = 0;
const MAX_IN_FLIGHT = 1000;
const TIMEOUT_MS = 30_000;

async function timed(name, fn) {
  const t0 = performance.now();
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { status: 0, ok: false, kind: e?.name === "TimeoutError" ? "timeout" : "network" };
  }
  samples[name].push({ ms: performance.now() - t0, status: r.status, ok: r.ok, kind: r.kind });
}

// Never follows a redirect (review 24/11/2026): a test host that forwards to another site would otherwise get the same
// pretend gift posted there. Any redirect stops the run.
async function jsonPost(path, body, headers = {}) {
  const res = await fetch(origin + path, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
    halted ??= `${path} answered with a redirect (${res.status}). Run stopped: nothing is ever sent on to another address.`;
  }
  return res;
}

async function checkout() {
  const n = ++seq;
  const res = await jsonPost("/api/app/checkout", {
    slug: args["charity-slug"],
    giftCents,
    contributionCents: 0,
    shownTotalCents: giftCents,
    details: {
      donor_type: "individual",
      // example.invalid can never receive mail; one address per request keeps clear of the per-email limit.
      email: `loadtest+${Date.now()}-${n}@example.invalid`,
      first_name: "Load",
      last_name: "Test",
      age_confirmed: true,
      popia_consent: true,
    },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 200 && body?.ok) {
    // Stop before the payment page. Only the stand-in test page is acceptable; never open it, never open anything else.
    if (typeof body.redirectUrl !== "string" || !body.redirectUrl.startsWith(`${origin}/test-gateway?`)) {
      halted = "Checkout returned a payment address that is not this site's stand-in test page. Run stopped: this site may be wired to a real payment provider.";
      return { status: res.status, ok: false, kind: "not_test_gateway" };
    }
    references.push(body.reference);
    return { status: res.status, ok: true };
  }
  const message = String(body?.message ?? "");
  const kind = /too many attempts/i.test(message) ? "rate_limited" : res.status === 404 ? "app_giving_off" : "refused";
  return { status: res.status, ok: false, kind };
}

async function webhook() {
  // A reference from a gift this run started when there is one; otherwise a made-up one (signature, event store and "no such gift" path only).
  const reference = references.shift();
  const { body, headers } = signedWebhook({ id: randomUUID(), reference: reference ?? randomUUID(), amountCents: giftCents, secret });
  const res = await jsonPost("/api/webhooks/test", body, headers);
  await res.arrayBuffer().catch(() => null);
  return { status: res.status, ok: res.status === 200, kind: reference ? "matched" : "unmatched" };
}

async function page(paths) {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const res = await fetch(origin + path, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  await res.arrayBuffer().catch(() => null);
  const signedOut = res.status >= 300 && res.status < 400;
  return { status: res.status, ok: res.status === 200, kind: signedOut ? "redirected_not_signed_in" : undefined };
}

const actions = { checkout, webhook, dashboard: () => page(DASHBOARD_PAGES), receipts: () => page(RECEIPT_PAGES) };
const pick = () => {
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of mix) if ((r -= w) < 0) return name;
  return mix[0][0];
};

function fire() {
  if (inFlight >= MAX_IN_FLIGHT) {
    dropped++;
    return;
  }
  const name = pick();
  inFlight++;
  timed(name, actions[name]).finally(() => inFlight--);
}

const started = performance.now();
let last = started;
let credit = 0;
let lastReport = started;
await new Promise((resolve) => {
  const tick = setInterval(() => {
    const now = performance.now();
    const elapsed = (now - started) / 1000;
    if (halted || elapsed >= durationSec) {
      clearInterval(tick);
      resolve();
      return;
    }
    credit += rateAt(elapsed, { targetRate, rampSec }) * ((now - last) / 1000);
    last = now;
    while (credit >= 1) {
      credit -= 1;
      fire();
    }
    if (now - lastReport >= 10_000) {
      lastReport = now;
      const sent = Object.values(samples).reduce((s, a) => s + a.length, 0);
      console.log(`  ${Math.round(elapsed)}s: ${rateAt(elapsed, { targetRate, rampSec }).toFixed(1)}/s, ${sent} done, ${inFlight} waiting`);
    }
  }, 25);
});
// Let the last requests finish (up to the timeout) so they are counted.
const drainUntil = performance.now() + TIMEOUT_MS + 1000;
while (inFlight > 0 && performance.now() < drainUntil) await new Promise((r) => setTimeout(r, 50));

const wall = (performance.now() - started) / 1000;
const result = { target: origin, scenario, targetRate, durationSec, rampSec, wallSec: Math.round(wall * 10) / 10, dropped, halted, scenarios: {}, verdict: "not judged" };
let anyFail = false;
for (const [name, list] of Object.entries(samples)) {
  if (!list.length) continue;
  const s = summarise(list);
  const checks = judge(s, thresholds);
  if (checks.some((c) => c.state === "fail")) anyFail = true;
  result.scenarios[name] = { ...s, checks };
}
const noThresholds = thresholds.maxErrorPct === undefined && thresholds.maxP95Ms === undefined;
// An unset limit is never a pass, in the saved file as on screen (review 24/11/2026).
result.verdict = verdictOf({ halted, anyFail, dropped, thresholds });

console.log(`\nFinished in ${result.wallSec}s${dropped ? `, ${dropped} requests not sent (more than ${MAX_IN_FLIGHT} waiting: the site is not keeping up)` : ""}`);
if (halted) console.log(`STOPPED: ${halted}`);
for (const [name, s] of Object.entries(result.scenarios)) {
  console.log(`\n${name}: ${s.requests} requests, ${s.failed} failed (${s.errorPct}%)`);
  console.log(`  time ms: p50 ${s.p50}  p95 ${s.p95}  p99 ${s.p99}  max ${s.max}`);
  console.log(`  status: ${JSON.stringify(s.byStatus)}${Object.keys(s.byKind).length ? `  kinds: ${JSON.stringify(s.byKind)}` : ""}`);
  for (const c of s.checks) console.log(`  ${c.name}: ${c.state}${c.limit !== undefined ? ` (got ${c.got}, limit ${c.limit})` : ""}`);
}
console.log(
  result.verdict === "not judged"
    ? "\nNo thresholds were given, so there is no pass or fail on the numbers (Yehuda to confirm them: docs/load-test.md)."
    : result.verdict === "partial"
      ? `\nVerdict: partial (not set: ${thresholds.maxErrorPct === undefined ? "error rate" : "p95 time"}), so this is not a pass.`
      : `\nVerdict: ${result.verdict}`,
);
console.log("Also check the database connections and the hosting dashboard for the same window (docs/load-test.md).");
if (args.json) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(args.json, JSON.stringify(result, null, 2));
}
process.exit(halted ? 3 : result.verdict === "fail" ? 1 : result.verdict === "pass" ? 0 : 2);
