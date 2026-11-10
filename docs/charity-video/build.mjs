// Builds docs/charity-video/video.built.html: video.html with the fonts, logo, splash and icons embedded, so the
// browser needs nothing from the network. Run from the repo root:
//   node docs/charity-video/build.mjs   then   node docs/charity-video/render.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "docs", "charity-video");
const b64 = (p) => readFileSync(join(root, p)).toString("base64");
const fonts = [
  `@font-face{font-family:"Bricolage Grotesque";font-weight:700;src:url(data:font/ttf;base64,${b64("src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf")}) format("truetype");}`,
  `@font-face{font-family:"Bricolage Grotesque";font-weight:800;src:url(data:font/ttf;base64,${b64("apps/mobile/assets/fonts/BricolageGrotesque-ExtraBold.ttf")}) format("truetype");}`,
  ...[400, 500, 600, 700].map((w) => `@font-face{font-family:"DM Sans";font-weight:${w};src:url(data:font/woff2;base64,${b64(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${w}-normal.woff2`)}) format("woff2");}`),
].join("\n");

// Simple line icons in the brand's colours (drawn here, not taken from anyone else's video).
const svg = (body, { size = 30, stroke = "#1749B5", w = 2.4 } = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons = {
  "%ICON_COINS%": svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>', { stroke: "#D9621C" }),
  "%ICON_PEN%": svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>', { stroke: "#D9621C" }),
  "%ICON_SHEET%": svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>', { stroke: "#D9621C" }),
  "%ICON_TICK%": svg('<path d="M5 12l5 5L20 7"/>', { size: 24, stroke: "#3E8E6A", w: 3 }),
  "%ICON_TICK_BIG%": svg('<path d="M5 12l5 5L20 7"/>', { size: 80, stroke: "#3E8E6A", w: 2.6 }),
  "%ICON_BANK%": svg('<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>', { size: 46 }),
  "%ICON_MAIL%": `<div style="width:96px;height:70px;border-radius:14px;background:#fff;border:3px solid #C9B4FA;box-shadow:0 14px 30px rgba(14,27,61,.18);display:flex;align-items:center;justify-content:center">${svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', { size: 44 })}</div>`,
};

let html = readFileSync(join(dir, "video.html"), "utf8")
  .replace("/*FONTS*/", fonts)
  .replaceAll("%LOGO%", `data:image/png;base64,${b64("public/logo.png")}`)
  .replaceAll("%SPLASH%", `data:image/png;base64,${b64("public/brand/splash.png")}`);
for (const [k, v] of Object.entries(icons)) html = html.replaceAll(k, v);
if (/%[A-Z_]+%/.test(html)) throw new Error("A placeholder was not filled: " + html.match(/%[A-Z_]+%/)[0]);

// House style: no em dashes or exclamation marks in what people read.
const words = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "").replace(/<[^>]+>/g, " ").replace(/data:[^"')]+/g, "");
if (/—/.test(words)) throw new Error("An em dash slipped in.");
if (/!/.test(words.replace(/<!doctype html>/i, ""))) throw new Error("An exclamation mark slipped in.");
writeFileSync(join(dir, "video.built.html"), html);
console.log("video.built.html written,", (html.length / 1e6).toFixed(2), "MB");
