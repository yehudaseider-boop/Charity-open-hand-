// Renders briefing.html to the PDF with headless Chrome (Playwright), two passes so the contents page
// shows real page numbers. Run from the repo root:  node docs/legal-briefing/render.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const dir = join(process.cwd(), "docs", "legal-briefing");
const html = join(dir, "briefing.html");
const pdf = join(dir, "Givezy-legal-and-tax-briefing.pdf");

const header = `<div style="font-family: Arial, sans-serif; font-size: 7.5pt; color: #4A5878; width: 100%; padding: 0 18mm; display:flex; justify-content: space-between; border-bottom: 0.4pt solid #ECE8F6; padding-bottom: 1.5mm;"><span>Givezy: briefing for legal and tax review · Draft 04/11/2026</span><span>Test only, nothing live</span></div>`;
const footer = `<div style="font-family: Arial, sans-serif; font-size: 7.5pt; color: #4A5878; width: 100%; padding: 0 18mm; display:flex; justify-content: space-between;"><span>Confidential: for Yosef and the accountant</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

async function once() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdf, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: header, footerTemplate: footer, margin: { top: "22mm", bottom: "20mm", left: "18mm", right: "18mm" } });
  await browser.close();
}
const pagesText = () => execFileSync("pdftotext", ["-layout", pdf, "-"]).toString().split("\f");
function locate() {
  const toc = JSON.parse(readFileSync(join(dir, "samples", "toc.json"), "utf8"));
  const pages = pagesText();
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const out = {};
  let from = pages.findIndex((p) => p.includes("How the numbering works")) + 2;
  for (const t of toc) {
    if (t.key === "contents") { out[t.key] = 2; continue; }
    const needle = norm(t.text);
    for (let i = from - 1; i < pages.length; i++) {
      if (pages[i].split("\n").some((l) => norm(l).startsWith(needle))) { out[t.key] = i + 1; from = i + 1; break; }
    }
    if (!out[t.key]) console.warn("heading not found:", t.text);
  }
  return out;
}

await once();
writeFileSync(join(dir, "samples", "page-numbers.json"), JSON.stringify(locate()));
execFileSync("node", [join(dir, "build.mjs")], { stdio: "inherit" });
await once();
const again = locate();
writeFileSync(join(dir, "samples", "page-numbers.json"), JSON.stringify(again));
console.log("pages:", pagesText().length - 1);
