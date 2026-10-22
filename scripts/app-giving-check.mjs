/**
 * Gives through the app's server routes, end to end, against a running copy of the website that uses
 * the test gateway (never a real one): quote, start a gift, pay or decline on the test payment page,
 * then ask for the outcome the way the app does. Also a monthly gift, and the refusals (below the
 * minimum, a changed total, no consent, no monthly authorisation, a wrong token, an unknown charity).
 *
 * Needs a Chromium browser (CHROMIUM_PATH; the cloud workspace has one at /opt/pw-browsers/chromium).
 * Run: start the website with APP_GIVING=yes and the test gateway, then
 *   SITE=http://localhost:3005 CHARITY=<slug> node scripts/app-giving-check.mjs
 * Every run uses a new e2e…@example.test address (one address is limited to a few gifts in 10 minutes).
 * It records real test donations in that database: use a local or test database only.
 */
import { chromium } from "playwright-core";

const S = process.env.SITE ?? "http://localhost:3005";
const SLUG = process.env.CHARITY ?? "northcliff-meals-fund";
const RUN = `${Date.now()}`;
const post = async (p, b) => { const r = await fetch(S + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return [r.status, await r.json().catch(() => null)]; };
const details = (extra = {}) => ({ donor_type: "individual", email: `e2e${RUN}@example.test`, first_name: "Thandi", last_name: "Mokoena", age_confirmed: true, popia_consent: true, giving_kind: "tzedaka", ...extra });
const out = [];
const log = (name, ok, info = "") => { out.push(`${ok ? "PASS" : "FAIL"}  ${name}${info ? "  (" + info + ")" : ""}`); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

async function payOn(url, button) {
  const p = await browser.newPage();
  await p.goto(url);
  await Promise.all([p.waitForURL(/donate\/return/, { timeout: 30000 }), p.getByRole("button", { name: button }).click()]);
  const text = await p.locator("main").innerText();
  await p.close();
  return text;
}
async function status(ref, token) { return post("/api/app/status", { reference: ref, token }); }

// 1. quote
let [s, q] = await post("/api/app/quote", { slug: SLUG, giftCents: 36000, contributionCents: 0 });
log("quote R360", s === 200 && q.ok, JSON.stringify(q).slice(0, 120));
// 2. below minimum
[s, q] = await post("/api/app/quote", { slug: SLUG, giftCents: 2000, contributionCents: 0 });
log("quote below R30 refused", s === 422 && !q.ok, q?.message);
// 3. once-off paid
let cs, c;
const shown = (await post("/api/app/quote", { slug: SLUG, giftCents: 36000, contributionCents: 0 }))[1].quote.totalCents;
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 36000, contributionCents: 0, shownTotalCents: shown, details: details() });
log("checkout once-off", cs === 200 && c.redirectUrl, c?.message ?? "");
let [ss, st] = await status(c.reference, c.token);
log("before paying: pending, not paid", st?.outcome === "pending", JSON.stringify(st));
const paidPage = await payOn(c.redirectUrl, /pay|success/i);
[ss, st] = await status(c.reference, c.token);
log("after Pay: paid", st?.outcome === "paid", JSON.stringify(st));
log("return page says thank you", /thank/i.test(paidPage), paidPage.slice(0, 160).replace(/\n/g, " | "));
// 4. wrong token
[ss, st] = await status(c.reference, "x".repeat(43));
log("wrong token refused", ss === 404, JSON.stringify(st));
// 5. declined
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 5000, contributionCents: 0, shownTotalCents: (await post("/api/app/quote", { slug: SLUG, giftCents: 5000, contributionCents: 0 }))[1].quote.totalCents, details: details() });
const declinedPage = await payOn(c.redirectUrl, /decline|fail/i);
[ss, st] = await status(c.reference, c.token);
log("after Decline: failed", st?.outcome === "failed", JSON.stringify(st));
log("decline page says nothing was charged", /nothing was charged|not charged/i.test(declinedPage), declinedPage.slice(0, 200).replace(/\n/g, " | "));
// 6. shown total tampered
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 36000, contributionCents: 0, shownTotalCents: 100, details: details() });
log("changed total refused", !c?.ok, `${cs} ${c?.message}`);
// 7. closed sheet: checkout then never pay
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 5000, contributionCents: 0, shownTotalCents: (await post("/api/app/quote", { slug: SLUG, giftCents: 5000, contributionCents: 0 }))[1].quote.totalCents, details: details() });
[ss, st] = await status(c.reference, c.token);
log("closed sheet: still pending, nothing paid", st?.outcome === "pending", JSON.stringify(st));
// 8. monthly
const mq = (await post("/api/app/quote", { slug: SLUG, giftCents: 50000, contributionCents: 0 }))[1].quote.totalCents;
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 50000, contributionCents: 0, shownTotalCents: mq, details: details({ monthly: true, monthly_authorised: true }) });
log("checkout monthly", cs === 200 && c.redirectUrl, `${cs} ${c?.message ?? ""} ${JSON.stringify(c?.fieldErrors ?? "")}`);
if (c?.redirectUrl) {
  await payOn(c.redirectUrl, /pay|success/i);
  [ss, st] = await status(c.reference, c.token);
  log("monthly first payment paid", st?.outcome === "paid", JSON.stringify(st));
  
}
// 9. monthly without authorisation
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 50000, contributionCents: 0, shownTotalCents: mq, details: details({ monthly: true }) });
log("monthly without authorisation refused", !c?.ok, `${cs} ${JSON.stringify(c?.fieldErrors ?? c?.message)}`);
// 10. missing consent
[cs, c] = await post("/api/app/checkout", { slug: SLUG, giftCents: 5000, contributionCents: 0, shownTotalCents: 5000, details: details({ popia_consent: false }) });
log("no consent refused", !c?.ok, `${cs} ${JSON.stringify(c?.fieldErrors ?? c?.message)}`);
// 11. unknown charity
[cs, c] = await post("/api/app/checkout", { slug: "no-such-charity", giftCents: 5000, contributionCents: 0, shownTotalCents: 5000, details: details() });
log("unknown charity refused plainly", !c?.ok, `${cs} ${c?.message}`);
await browser.close();
console.log(out.join("\n"));
process.exitCode = out.some((l) => l.startsWith("FAIL")) ? 1 : 0;
