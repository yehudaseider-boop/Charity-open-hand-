import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("playwright-core");
const URL0 = (process.env.BASE || "http://localhost:8099/index.html");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("FAIL:", n, x ?? ""); } };
const ROUTES = ["#/", "#/donations", "#/monthly", "#/donors", "#/donors/d1", "#/thank", "#/email", "#/sent", "#/campaigns", "#/profile", "#/updates", "#/receipts", "#/report", "#/team", "#/application", "#/public", "#/account"];
async function sweep(label, width, mutate) {
  const ctx = await b.newContext({ viewport: { width, height: 800 }, locale: "en-ZA", timezoneId: "Africa/Johannesburg" });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(URL0 + "#/"); await p.waitForTimeout(200);
  if (mutate) { await p.evaluate(mutate); await p.reload(); await p.waitForTimeout(250); }
  for (const r of ROUTES) {
    await p.goto(URL0 + r); await p.waitForTimeout(140);
    const info = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, h1: (document.querySelector("h1") || {}).textContent || "", wide: [...document.querySelectorAll("main *")].filter((e) => e.tagName !== "BR").filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".scroll,.chart-wrap,svg")).length }));
    ok(label + " " + r + " heading", info.h1.trim().length > 0, info.h1);
    ok(label + " " + r + " no sideways scroll", info.over <= 1, info.over);
    ok(label + " " + r + " nothing pokes out", info.wide === 0, info.wide);
  }
  ok(label + " no errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  await ctx.close();
}
await sweep("phone", 390, null);
await sweep("tablet", 820, null);
await sweep("desktop", 1440, null);
// empty charity: no gifts, donors, campaigns, updates, sent
await sweep("empty", 390, () => { const k = "givezy-psfa-demo-v3"; const S = JSON.parse(localStorage.getItem(k)); S.gifts = []; S.monthly = []; S.campaigns = []; S.updates = []; S.sent = []; S.segments = []; localStorage.setItem(k, JSON.stringify(S)); });
// silly data: very long names, huge amounts, odd characters
await sweep("silly", 390, () => { const k = "givezy-psfa-demo-v3"; const S = JSON.parse(localStorage.getItem(k)); S.donors[0].first = "Wolfeschlegelsteinhausenbergerdorff".repeat(3); S.donors[0].last = "<script>alert(1)</script>"; S.donors[1].org = ""; S.gifts[0].amount = 99999999999; S.gifts[1].amount = 1; S.profile.name = "A very long charity name that goes on and on and on and on"; S.campaigns[0].title = "Campaign ".repeat(20); S.donors[2].notes = [{ id: "n9", text: "x".repeat(500), at: "2026-10-01T10:00:00" }]; localStorage.setItem(k, JSON.stringify(S)); });
// storage blocked
{
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } }); const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); });
  await p.goto(URL0 + "#/"); await p.waitForTimeout(300);
  ok("storage blocked: still loads", (await p.locator("h1").first().innerText()) === "Overview" && errs.length === 0, errs.join("|"));
  ok("storage blocked: says so", await p.locator("#storage-note").isVisible());
  await p.click(".head-actions button:has-text('Record a gift')"); await p.waitForSelector(".modal"); await p.keyboard.press("Escape");
  await ctx.close();
}
// no javascript errors when a bad route / odd hash
{
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } }); const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  for (const h of ["#/donors/%E0%A4%A", "#//", "#/donations?page=-5&month=zzz&ty=abc", "#/donations?page=999", "#/report?year=1900", "#/email?audience=tag:", "#/monthly?show=<b>"]) { await p.goto(URL0 + h); await p.waitForTimeout(120); }
  ok("odd addresses do not crash", errs.length === 0, errs.join("|"));
  await ctx.close();
}
console.log("PART 3: passed", pass, "failed", fail);
await b.close();
