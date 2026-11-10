// Builds docs/charity-onboarding/onboarding.html: the words from content.mjs, the fonts, logo and splash embedded
// as base64, and the figures (review time, smallest gift) read from src/config/platform.ts so they never drift.
// Run from the repo root:  node docs/charity-onboarding/build.mjs   then   node docs/charity-onboarding/render.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { body } from "./content.mjs";

const root = process.cwd();
const dir = join(root, "docs", "charity-onboarding");
const b64 = (p) => readFileSync(join(root, p)).toString("base64");
const { platformConfig: cfg } = await import(pathToFileURL(join(root, "src/config/platform.ts")).href);
const { art } = await import(pathToFileURL(join(root, "src/components/illustration-art.ts")).href);

// The pack says the card provider's fee comes off each gift and says no rate. Stop if rates are now filled in.
if (cfg.fees.gatewayPercent !== null || cfg.fees.gatewayFixedCents !== null) throw new Error("Gateway rates are now set: check what the pack says about fees.");

const fonts = [
  `@font-face{font-family:"Bricolage Grotesque";font-weight:700;src:url(data:font/ttf;base64,${b64("src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf")}) format("truetype");}`,
  `@font-face{font-family:"Bricolage Grotesque";font-weight:800;src:url(data:font/ttf;base64,${b64("apps/mobile/assets/fonts/BricolageGrotesque-ExtraBold.ttf")}) format("truetype");}`,
  ...[400, 500, 600, 700].map(
    (w) => `@font-face{font-family:"DM Sans";font-weight:${w};src:url(data:font/woff2;base64,${b64(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${w}-normal.woff2`)}) format("woff2");}`,
  ),
].join("\n");
const logo = `data:image/png;base64,${b64("public/logo.png")}`;
const splash = `data:image/png;base64,${b64("public/brand/splash.png")}`;
const today = process.env.PACK_DATE ?? "10/11/2026";

const html = readFileSync(join(dir, "template.html"), "utf8")
  .replace("/*FONTS*/", fonts)
  .replace("<!--BODY-->", body({ cfg, logo, splash, today, art }));

// House style checks: no em dashes, no exclamation marks in the words, no gateway name.
const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/data:[^"')]+/g, "");
if (/—/.test(text)) throw new Error("An em dash slipped in.");
if (/!/.test(text)) throw new Error("An exclamation mark slipped in.");
if (/paystack/i.test(text)) throw new Error("A gateway name slipped in.");
writeFileSync(join(dir, "onboarding.html"), html);
console.log("onboarding.html written,", (html.length / 1e6).toFixed(2), "MB");
