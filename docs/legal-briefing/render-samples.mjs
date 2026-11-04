// Renders the sample receipt (samples/sample-receipt.html) to PNG pages for Appendix B.
// Run after make-samples.ts:  node docs/legal-briefing/render-samples.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = join(process.cwd(), "docs", "legal-briefing", "samples");
const work = mkdtempSync(join(tmpdir(), "receipt-"));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(readFileSync(join(dir, "sample-receipt.html"), "utf8"), { waitUntil: "load" });
const pdf = join(work, "receipt.pdf");
await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
execFileSync("pdftoppm", ["-png", "-r", "130", pdf, join(work, "p")]);
const files = execFileSync("ls", [work]).toString().split("\n").filter((f) => f.startsWith("p-") && f.endsWith(".png")).sort();
const urls = files.map((f) => `data:image/png;base64,${readFileSync(join(work, f)).toString("base64")}`);
writeFileSync(join(dir, "receipt-pages.json"), JSON.stringify(urls));
console.log("receipt pages:", urls.length);
