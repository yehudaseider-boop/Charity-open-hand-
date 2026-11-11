// Builds docs/dashboard-video/video.built.html: video.html with the fonts, logo and the captured dashboard screens
// embedded, so the browser needs nothing from the network. Run from the repo root, after capture.mjs:
//   node docs/dashboard-video/build.mjs [v2.html]   then   node docs/dashboard-video/render.mjs [out.mp4] [--page v2.built.html]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "docs", "dashboard-video");
const b64 = (p) => readFileSync(join(root, p)).toString("base64");
const fonts = [
  `@font-face{font-family:"Bricolage Grotesque";font-weight:700;src:url(data:font/ttf;base64,${b64("src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf")}) format("truetype");}`,
  `@font-face{font-family:"Bricolage Grotesque";font-weight:800;src:url(data:font/ttf;base64,${b64("apps/mobile/assets/fonts/BricolageGrotesque-ExtraBold.ttf")}) format("truetype");}`,
  ...[400, 500, 600, 700].map((w) => `@font-face{font-family:"DM Sans";font-weight:${w};src:url(data:font/woff2;base64,${b64(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${w}-normal.woff2`)}) format("woff2");}`),
].join("\n");

const shots = readdirSync(join(dir, "shots")).filter((f) => f.endsWith(".png")).map((f) => f.replace(".png", ""));
const src = (n) => `data:image/png;base64,${b64(`docs/dashboard-video/shots/${n}.png`)}`;
// Which page: video.html (first cut) by default, or another, e.g. node build.mjs v2.html
const page = process.argv[2] ?? "video.html";
let html = readFileSync(join(dir, page), "utf8")
  .replace("/*FONTS*/", fonts)
  .replace("%SHOTS_JSON%", readFileSync(join(dir, "shots", "shots.json"), "utf8"))
  .replace("%SHOT_IMGS%", shots.filter((n) => n !== "thank-typed").map((n) => `<img class="shot" data-n="${n}" src="${src(n)}" alt="">`).join("\n"))
  .replace(/%SHOT_([a-z-]+)%/g, (_, n) => src(n))
  .replaceAll("%LOGO%", `data:image/png;base64,${b64("public/logo.png")}`)
  .replaceAll("%SPLASH%", `data:image/png;base64,${b64("public/brand/splash.png")}`);
if (/%[A-Za-z_-]+%/.test(html)) throw new Error("A placeholder was not filled: " + html.match(/%[A-Za-z_-]+%/)[0]);

// House style: no em dashes or exclamation marks in what people read.
const words = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "").replace(/<[^>]+>/g, " ").replace(/data:[^"')]+/g, "");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const said = [...script.matchAll(/"([^"]*<b>[^"]*|[A-Z][^"]{12,})"/g)].map((m) => m[1]).join(" ");
if (/—/.test(words + said)) throw new Error("An em dash slipped in.");
if (/!/.test(words.replace(/<!doctype html>/i, "") + said)) throw new Error("An exclamation mark slipped in.");
const outName = page.replace(".html", ".built.html");
writeFileSync(join(dir, outName), html);
console.log(outName, "written,", (html.length / 1e6).toFixed(2), "MB");
