// Prints pilot-pack.html to Givezy-charity-pilot-pack.pdf with headless Chrome (Playwright).
// Run from the repo root, after build.mjs:  node docs/pilot-pack/render.mjs
import { createRequire } from "node:module";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const dir = join(process.cwd(), "docs", "pilot-pack");
const date = process.env.PACK_DATE ?? "09/11/2026";
const footer = `<div style="font-family: Arial, sans-serif; font-size: 7.5pt; color: #4A5878; width: 100%; padding: 0 16mm; display:flex; justify-content: space-between;"><span>Givezy charity pilot pack · Draft ${date}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + join(dir, "pilot-pack.html"), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`));
console.log("fonts loaded:", loaded.join(", "));
await page.pdf({
  path: join(dir, "Givezy-charity-pilot-pack.pdf"), format: "A4", printBackground: true,
  displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer,
  margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" },
});
await browser.close();
console.log("written Givezy-charity-pilot-pack.pdf");
