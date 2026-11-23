// Captioned App Store and Google Play screenshots for Givezy (sample charities, labelled as such).
//
// 1. Take the raw app screens from the app's web build:
//      cd apps/mobile && npx expo export --platform web --output-dir <tmp>/web
//      npx -y serve -s <tmp>/web -l 4801          (leave it running)
//      node docs/app-store/compose-screens.mjs capture <tmp>/raw
// 2. Put them in the store frames (fonts come from Google Fonts, so this needs the internet):
//      node docs/app-store/compose-screens.mjs compose <tmp>/raw
//    Writes docs/app-store/screens-captioned/ios (1290 × 2796) and /android (1080 × 1920).
//    Add a third argument to also save an overview of the six iPhone images side by side there.
//
// The words for each image live in SHOTS below. Founder's rule: Givezy's own lines only, nothing
// invented, no fees, prices or counts. The look is in compose-template.html.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

// Playwright is installed globally on the build machine, which only CommonJS loading finds.
const load = createRequire(import.meta.url);
const { chromium } = load("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const [mode, rawDir, overviewPath] = process.argv.slice(2);
if (!["capture", "compose"].includes(mode) || !rawDir) {
  console.error("Use: node docs/app-store/compose-screens.mjs capture|compose <raw screens folder> [overview.png]");
  process.exit(1);
}

const NOTE = "Shown with sample charities";
// ground: blue (white words, orange key word), white or lilac (ink words, blue key word with an orange swash).
const SHOTS = [
  { file: "1-welcome", path: "/", welcomed: false, ground: "white", logo: true,
    headline: "Giving, / made [easy]", sub: "All your giving, finally in one place.", note: "" },
  { file: "2-discover", path: "/discover", welcomed: true, ground: "blue", eyebrow: "Discover",
    headline: "Find a [checked] charity / you care about", sub: "Search by name, cause or area.", note: NOTE },
  { file: "3-charity", path: "/charity/sandton-patient-care", welcomed: true, scroll: { android: 44 }, ground: "lilac", eyebrow: "Charity page",
    headline: "See where / your gift [goes]", sub: "In the charity's own words.", note: NOTE },
  { file: "4-home", path: "/home", welcomed: true, ground: "blue", eyebrow: "Home",
    headline: "Give again / in a few [taps]", sub: "Your gifts and monthly donations together.", note: NOTE },
  { file: "5-progress", path: "/giving", welcomed: true, ground: "white", eyebrow: "Progress",
    headline: "Set a giving [goal] / for the tax year", sub: "Month by month, where it went and how you give.", note: NOTE },
  { file: "6-receipts", path: "/receipts", welcomed: true, ground: "blue", eyebrow: "s18A receipts",
    headline: "s18A receipts without / the [February rush]", sub: "One per charity, each tax year.", note: NOTE },
];

// Splashes in layout units (the image is 27 units wide). They bleed off the edges and stay clear of the words:
// the top-right one ends above the headline's right edge, the rest sit behind the phone.
const SPLASHES = {
  blue: [
    { size: 9, color: "#FF8A3D", at: { right: -4.2, top: -5.2 } },
    { kind: "ring", size: 11, stroke: 1.5, color: "#C9B4FA", at: { left: -6.5, top: 22 } },
    { size: 16, color: "rgba(255,255,255,0.07)", at: { right: -8, bottom: 9 } },
    { size: 1.1, color: "#C9B4FA", at: { right: 1.3, top: 19.5 } },
  ],
  white: [
    { size: 10, color: "#FFEBDD", at: { right: -4.6, top: -5.6 } },
    { size: 1, color: "#FF8A3D", at: { right: 5.4, top: 3.4 } },
    { size: 15, color: "#F4F1FF", at: { left: -7.5, top: 24 } },
    { kind: "ring", size: 10, stroke: 1.4, color: "#C9B4FA", at: { right: -5.5, bottom: 12 } },
  ],
  lilac: [
    { size: 10, color: "#FFEBDD", at: { right: -4.6, top: -5.6 } },
    { size: 1, color: "#FF8A3D", at: { right: 5.4, top: 3.4 } },
    { kind: "ring", size: 11, stroke: 1.5, color: "#C9B4FA", at: { left: -6.5, top: 23 } },
    { size: 14, color: "#FFFFFF", at: { right: -6, bottom: 10 } },
  ],
};

const SETS = [
  // The iPhone 6.9" size; the raw screen is the app at 430 × 932 points, taken at three times for sharpness.
  { os: "ios", w: 1290, h: 2796, view: { width: 430, height: 932 } },
  // Google Play phone, 9:16. A slightly shorter screen than the iPhone's so the phone fills the squatter image;
  // 820 is the height where every screen's cards end cleanly (checked 23/11/2026).
  { os: "android", w: 1080, h: 1920, view: { width: 412, height: 820 } },
];

function layoutFor(set) {
  const u = set.w / 27;
  return set.os === "ios"
    ? { side: 2.3 * u, top: 3.3 * u, headline: 2.22 * u, sub: 0.98 * u, textWidth: 21.6 * u, gap: 1.9 * u, noteSpace: 2.6 * u, noteSize: 0.8 * u, maxPhone: 21.5 * u }
    : { side: 2.3 * u, top: 2.0 * u, headline: 2.24 * u, sub: 0.95 * u, textWidth: 21.6 * u, gap: 1.2 * u, noteSpace: 2.1 * u, noteSize: 0.8 * u, maxPhone: 21 * u };
}

// The sample "fresh bread" photo is swapped for the fruit-and-vegetables one (no religious imagery).
const BREAD = "hf_20261011_002939_f36bd191-cf6e-4347-a046-ffb5def7c7af";
const VEG = "https://d8j0ntlcm91z4.cloudfront.net/user_3JMbY89afWySU23FksuSQhKkNXQ/hf_20261011_003002_378081f3-914c-4b04-96e8-d2314e88ea3e.png";

async function capture(browser) {
  const base = process.env.APP_URL || "http://localhost:4801";
  for (const set of SETS) {
    mkdirSync(join(rawDir, set.os), { recursive: true });
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({ viewport: set.view, deviceScaleFactor: 3 });
      await ctx.route(`**/${BREAD}.png`, async (r) => r.fulfill({ response: await ctx.request.get(VEG) }));
      const page = await ctx.newPage();
      await page.goto(`${base}/?preview=iphone`);
      await page.evaluate((w) => { localStorage.clear(); if (w) localStorage.setItem("nediv-lev.welcomed", "1"); }, shot.welcomed);
      await page.goto(`${base}${shot.path}?preview=iphone`, { waitUntil: "networkidle" });
      await page.waitForTimeout(4000); // sample data, photos and the drop-in animations settle
      const scroll = shot.scroll?.[set.os];
      if (scroll) {
        // A small scroll where a card would otherwise end under a bar: the screen's own scroller, the tallest one.
        await page.evaluate((y) => {
          const boxes = [...document.querySelectorAll("div")].filter((d) => d.scrollHeight > d.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(d).overflowY));
          boxes.sort((a, b) => b.clientHeight - a.clientHeight);
          if (boxes[0]) boxes[0].scrollTop = y;
        }, scroll);
        await page.waitForTimeout(800);
      }
      await page.screenshot({ path: join(rawDir, set.os, `${shot.file}.png`) });
      await ctx.close();
      console.log("captured", set.os, shot.file);
    }
  }
}

async function compose(browser) {
  const template = pathToFileURL(join(here, "compose-template.html")).href;
  const brand = pathToFileURL(join(repo, "public/brand")).href;
  for (const set of SETS) {
    const out = join(here, "screens-captioned", set.os);
    mkdirSync(out, { recursive: true });
    const layout = layoutFor(set);
    for (const shot of SHOTS) {
      const settings = {
        os: set.os, w: set.w, h: set.h, layout, brand, ground: shot.ground, logo: !!shot.logo, eyebrow: shot.eyebrow || "",
        headline: shot.headline, sub: shot.sub, note: shot.note, splashes: SPLASHES[shot.ground],
        screen: pathToFileURL(resolve(rawDir, set.os, `${shot.file}.png`)).href,
      };
      const ctx = await browser.newContext({ viewport: { width: set.w, height: set.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(`${template}#${encodeURIComponent(JSON.stringify(settings))}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.body.dataset.ready);
      const info = JSON.parse(await page.evaluate(() => document.body.dataset.ready));
      const fontsOk = await page.evaluate(() => document.fonts.check('800 40px "Bricolage Grotesque"') && document.fonts.check('500 20px "DM Sans"'));
      if (!fontsOk) throw new Error("The Google fonts did not load; the images would use a stand-in font.");
      if (info.overflows) console.warn(`${set.os} ${shot.file}: the words run past the space kept for them; the phone moved down.`);
      if (info.headlineLines > 2) throw new Error(`${set.os} ${shot.file}: the headline needs ${info.headlineLines} lines.`);
      await page.screenshot({ path: join(out, `${shot.file}.png`) });
      await ctx.close();
      console.log("composed", set.os, shot.file, info);
    }
  }
  if (overviewPath) {
    // All six iPhone images side by side, for a quick look (3000px wide).
    const imgs = SHOTS.map((s) => `data:image/png;base64,${readFileSync(join(here, "screens-captioned/ios", `${s.file}.png`)).toString("base64")}`);
    const ctx = await browser.newContext({ viewport: { width: 3000, height: 1200 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(`<body style="margin:0;background:#E9E6F2;display:flex;gap:24px;padding:40px;box-sizing:border-box;width:3000px">${imgs
      .map((src) => `<img src="${src}" style="width:465px;height:auto;border-radius:18px;box-shadow:0 8px 30px rgba(14,27,61,.15)">`).join("")}</body>`);
    await page.waitForLoadState("networkidle");
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 3000, height: h });
    await page.screenshot({ path: overviewPath });
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  if (mode === "capture") await capture(browser);
  else await compose(browser);
} finally {
  await browser.close();
}
