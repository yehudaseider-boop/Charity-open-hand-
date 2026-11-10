// Prints onboarding.html to a PDF with headless Chrome, then lays real form fields over the drawn boxes (pdf-lib).
// Needs pdf-lib (npm install --no-save pdf-lib) and the Playwright Chromium. Run from the repo root, after build.mjs:
//   node docs/charity-onboarding/render.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const dir = join(process.cwd(), "docs", "charity-onboarding");
const out = join(dir, "Givezy-charity-onboarding-pack.pdf");
const PX_TO_PT = 0.75; // CSS pixels (96 per inch) to PDF points (72 per inch)
const PAGE_PX = (297 / 25.4) * 96; // an A4 page in CSS pixels

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.emulateMedia({ media: "print" });
await page.goto("file://" + join(dir, "onboarding.html"), { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
console.log("fonts loaded:", (await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`))).join(", "));

// Anything that does not fit its page is a build error: say which page. Only the words and fields count, not the
// decorative shapes that bleed off the edge on purpose. Content must stay above the footer line (14mm from the bottom).
const overflow = await page.evaluate(() => {
  const limit = (14 / 25.4) * 96;
  return [...document.querySelectorAll(".page")].map((p, i) => {
    const top = p.getBoundingClientRect().top;
    const bottoms = [...p.children].filter((c) => !c.matches(".bg, .foot, .pic")).map((c) => c.getBoundingClientRect().bottom - top);
    return { i: i + 1, over: Math.round(Math.max(...bottoms) - (p.clientHeight - limit)) };
  }).filter((x) => x.over > 0);
});
if (overflow.length) throw new Error("Too much on page(s): " + overflow.map((x) => `${x.i} (by ${x.over}px)`).join(", "));

const fields = await page.evaluate(() =>
  [...document.querySelectorAll(".f[data-n]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { name: el.dataset.n, kind: el.dataset.k, multi: Boolean(el.dataset.multi), opts: el.dataset.opts ? el.dataset.opts.split("|") : [], x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }),
);
const names = fields.map((f) => f.name);
if (new Set(names).size !== names.length) throw new Error("Two fields share a name: " + names.filter((n, i) => names.indexOf(n) !== i).join(", "));

const pdfBytes = await page.pdf({ width: "210mm", height: "297mm", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
await browser.close();

const pdf = await PDFDocument.load(pdfBytes);
const pages = pdf.getPages();
const expected = (await import("./content.mjs")).PAGES;
if (pages.length !== expected) throw new Error(`Expected ${expected} pages, Chrome made ${pages.length}.`);
const form = pdf.getForm();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const ink = rgb(0x0e / 255, 0x1b / 255, 0x3d / 255);
const lavender = rgb(0xc9 / 255, 0xb4 / 255, 0xfa / 255);
const blue = rgb(0x17 / 255, 0x49 / 255, 0xb5 / 255);
const white = rgb(1, 1, 1);
let counts = { text: 0, check: 0, select: 0 };

for (const f of fields) {
  const idx = Math.min(pages.length - 1, Math.floor((f.y + 1) / PAGE_PX));
  const pg = pages[idx];
  const { height: ph } = pg.getSize();
  const x = f.x * PX_TO_PT, w = f.w * PX_TO_PT, h = f.h * PX_TO_PT;
  const y = ph - ((f.y - idx * PAGE_PX) * PX_TO_PT) - h;
  // The field draws its own box (a viewer paints over anything drawn underneath), in the brand's lavender and blue.
  const common = { x, y, width: w, height: h, borderWidth: 1.1, borderColor: lavender, backgroundColor: white, textColor: ink };
  if (f.kind === "check") {
    const c = form.createCheckBox(f.name);
    c.addToPage(pg, { x, y, width: w, height: h, borderWidth: 1.4, borderColor: blue, backgroundColor: white, textColor: blue });
    counts.check += 1;
  } else if (f.kind === "select") {
    const d = form.createDropdown(f.name);
    d.addOptions(f.opts);
    d.select(f.opts[0]);
    d.addToPage(pg, { ...common, font });
    d.setFontSize(9);
    counts.select += 1;
  } else {
    const t = form.createTextField(f.name);
    if (f.multi) t.enableMultiline();
    t.addToPage(pg, { ...common, font });
    t.setFontSize(f.multi ? 9.5 : 10);
    counts.text += 1;
  }
}
form.updateFieldAppearances(font);
pdf.setTitle("Getting your charity started on Givezy");
pdf.setAuthor("Givezy");
pdf.setSubject("Charity onboarding pack (draft)");
writeFileSync(out, await pdf.save());
console.log(`written ${out}: ${pages.length} pages, ${counts.text} text boxes, ${counts.check} tick boxes, ${counts.select} drop-downs`);
