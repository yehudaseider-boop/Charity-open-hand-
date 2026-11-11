// Captures the real charity dashboard demo (/demo/dashboard) as sharp still screens for the product video, and notes
// where the buttons and cards sit on each one, so the video's cursor and zooms land on the right spot.
// Needs the website running (npm run build && npm run start, or any address in DEMO_URL). Run from the repo root:
//   DEMO_URL=http://localhost:3200 node docs/dashboard-video/capture.mjs
// Writes docs/dashboard-video/shots/*.png (2x) and shots/shots.json.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.env.DEMO_URL ?? "http://localhost:3200") + "/demo/dashboard";
const dir = join(process.cwd(), "docs", "dashboard-video", "shots");
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const manifest = {};

// The demo's own "made-up figures" note is swapped for a "Sample data" label on the video itself.
async function tidy({ hideSetup = false } = {}) {
  await page.evaluate((hideSetup) => {
    const box = (el) => { while (el && el.parentElement && !/border|rounded/.test(el.className || "")) el = el.parentElement; return el; };
    const find = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text));
    const note = find("p, div", "This is a demonstration");
    if (note) box(note).style.display = "none";
    // Demo-only "kept in this browser" messages: the real dashboard says the same without that part.
    for (const el of document.querySelectorAll("[role=status], p, div")) if (/^(Note saved|Tag added|Follow-up added)/.test(el.textContent.trim()) && el.children.length < 2) el.style.display = "none";
    if (hideSetup) {
      const h = find("h2, h3", "Getting started");
      if (h) box(h.parentElement).style.display = "none";
    }
    document.documentElement.style.scrollBehavior = "auto";
    const s = document.createElement("style");
    s.textContent = "*{caret-color:transparent!important;transition:none!important;animation:none!important}";
    document.head.append(s);
  }, hideSetup);
}

// Rects of named things, in page pixels at 1440 x 900 (the screenshot is twice that).
async function rects(map) {
  return page.evaluate((map) => {
    const out = {};
    for (const [name, [sel, text, nth = 0]] of Object.entries(map)) {
      const els = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0 && (!text || e.textContent.trim().startsWith(text)));
      const el = els[nth];
      if (!el) { out[name] = null; continue; }
      const r = el.getBoundingClientRect();
      out[name] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return out;
  }, map);
}

const NAV = {
  navOverview: ["aside a", "Overview"], navDonations: ["aside a", "Donations"], navMonthly: ["aside a", "Monthly donations"],
  navCampaigns: ["aside a", "Campaigns"], navReceipts: ["aside a", "s18A receipts"], navDonors: ["aside a", "Donors"],
  navThank: ["aside a", "Thank donors"],
};

async function shot(name, map = {}) {
  const r = await rects({ ...NAV, ...map });
  const missing = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`${name}: could not find ${missing.join(", ")}`);
  await page.screenshot({ path: join(dir, `${name}.png`) });
  manifest[name] = r;
  console.log("shot", name);
}

async function open(path, opts) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await tidy(opts);
}

async function scrollTo(sel, text, top) {
  await page.evaluate(([sel, text, top]) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text));
    window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - top);
  }, [sel, text, top]);
  await page.waitForTimeout(200);
}

// 1. Overview, as a charity sees it once set up (the set-up list is done and hidden).
await open("", { hideSetup: true });
await shot("overview", {
  title: ["h1", "Overview"], stats: ["p, span, div", "This month so far"], chart: ["h2, h3", "Donations by month"],
  sources: ["h2, h3", "Where gifts come from"], recordGift: ["a, button", "Record a gift"],
});
await scrollTo("h2, h3", "Donations by month", 120);
await shot("overview-chart", { chart: ["h2, h3", "Donations by month"], sources: ["h2, h3", "Where gifts come from"] });

// 2. Donations.
await open("/donations");
await shot("donations", {
  title: ["h1", "Donations"], table: ["table"], total: ["p, div, span", "R113 600"], recordGift: ["a, button", "Record a gift"],
  row0: ["tbody tr", "", 0], row1: ["tbody tr", "", 1], row2: ["tbody tr", "", 2], row3: ["tbody tr", "", 3], row4: ["tbody tr", "", 4],
  fromHead: ["th", "From"],
});

// 3. Donors list, then one donor with a tag and a follow-up added (the demo keeps these in the browser).
await open("/donors");
await shot("donors", { title: ["h1", "Donors"], aisha: ["main a", "AE"] });
await open("/donors/demo-donor-5");
await page.getByLabel("What to do").fill("Call to say thank you");
await page.getByRole("button", { name: "Add follow-up" }).click();
await page.getByLabel("Tag", { exact: true }).fill("Volunteer");
await page.getByRole("button", { name: "Add tag" }).click();
await page.getByLabel("Add a note").fill("Met at the open day. Happy to help with the winter drive.");
await page.getByRole("button", { name: "Save note" }).click();
await page.waitForTimeout(400);
await tidy();
await page.evaluate(() => window.scrollTo(0, 0));
await shot("donor", { name: ["h1", "Aisha Example"], given: ["p, div, span", "Given in all"], followups: ["h2", "Follow-ups"], tags: ["h2", "Tags"] });
await scrollTo("h2", "Follow-ups", 110);
await shot("donor-care", { followups: ["h2", "Follow-ups"], tags: ["h2", "Tags"], notes: ["h2", "Notes"] });

// 4. Thank donors: empty, written, asked to confirm. The video adds the dashboard's own words after: Sent to 14 donors.
await open("/thank-donors");
await shot("thank", { title: ["h1", "Thank donors"], box: ["textarea"], send: ["button", "Send thank-you"], month: ["h2", "November 2026"] });
await page.locator("textarea").first().fill("Thank you for giving to us this month. It means a great deal to the whole team.");
await shot("thank-typed", { box: ["textarea"], send: ["button", "Send thank-you"] });
await page.getByRole("button", { name: "Send thank-you" }).first().click();
await page.waitForTimeout(300);
await shot("thank-confirm", { yes: ["button", "Yes, send it"], ask: ["p", "Email this thank-you"] });
await page.getByRole("button", { name: "Yes, send it" }).click();
await page.waitForTimeout(600);

// 5. Monthly donations.
await open("/monthly");
await shot("monthly", { title: ["h1", "Monthly donations"], running: ["p, div, span", "Running"], declined: ["span", "Card declined"] });

// 6. Campaigns.
await open("/campaigns");
await shot("campaigns", { title: ["h1", "Campaigns"], first: ["p, div, span", "Winter food parcels"], second: ["p, div, span", "School shoes"], start: ["a, button", "Start a campaign"] });

// 7. s18A receipts.
await open("/receipts");
await shot("receipts", { title: ["h1", "s18A receipts"], asked: ["p, div, span", "Asked for an s18A receipt"], list: ["h2", "Yearly list"] });

writeFileSync(join(dir, "shots.json"), JSON.stringify(manifest, null, 1));
await browser.close();
console.log("written", Object.keys(manifest).length, "shots to", dir);
