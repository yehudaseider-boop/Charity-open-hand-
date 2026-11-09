// Builds docs/pilot-pack/pilot-pack.html: the words from content.mjs, the fonts, logo and splash embedded as base64,
// and the figures (minimum gift, review time, cut-off date) read from src/config/platform.ts so they never drift.
// Run from the repo root:  node docs/pilot-pack/build.mjs   then   node docs/pilot-pack/render.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { body } from "./content.mjs";

const root = process.cwd();
const dir = join(root, "docs", "pilot-pack");
const b64 = (p) => readFileSync(join(root, p)).toString("base64");
const { platformConfig: cfg } = await import(pathToFileURL(join(root, "src/config/platform.ts")).href);

// The pack says the card fee is paid by the charity and is not set yet. Stop if either has changed.
if (cfg.fees.gatewayChargePaidBy !== "charity") throw new Error("gatewayChargePaidBy changed: update section 2 of the pilot pack.");
if (cfg.fees.gatewayPercent !== null || cfg.fees.gatewayFixedCents !== null) throw new Error("Gateway rates are now set: update section 2 of the pilot pack.");

const fonts = [
  `@font-face{font-family:"Bricolage Grotesque";font-weight:700;src:url(data:font/ttf;base64,${b64("src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf")}) format("truetype");}`,
  `@font-face{font-family:"Bricolage Grotesque";font-weight:800;src:url(data:font/ttf;base64,${b64("apps/mobile/assets/fonts/BricolageGrotesque-ExtraBold.ttf")}) format("truetype");}`,
  ...[400, 500, 600, 700].map(
    (w) => `@font-face{font-family:"DM Sans";font-weight:${w};src:url(data:font/woff2;base64,${b64(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${w}-normal.woff2`)}) format("woff2");}`,
  ),
].join("\n");
const logo = `data:image/png;base64,${b64("public/logo.png")}`;
const splash = `data:image/png;base64,${b64("public/brand/splash.png")}`;
const today = process.env.PACK_DATE ?? "09/11/2026";

const html = readFileSync(join(dir, "template.html"), "utf8")
  .replace("/*FONTS*/", fonts)
  .replace("<!--BODY-->", body({ cfg, logo, splash, today }));

// House style checks: no em dashes, no exclamation marks in the words.
const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/data:[^"')]+/g, "");
if (/—/.test(text)) throw new Error("An em dash slipped in.");
if (/!/.test(text)) throw new Error("An exclamation mark slipped in.");
writeFileSync(join(dir, "pilot-pack.html"), html);
console.log("pilot-pack.html written,", (html.length / 1e6).toFixed(2), "MB");
