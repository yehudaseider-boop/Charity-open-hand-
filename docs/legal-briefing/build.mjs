// Builds docs/legal-briefing/briefing.html from the repo and the generated samples.
// Run from the repo root:  node docs/legal-briefing/build.mjs   (after make-samples.ts and render-samples.mjs)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { questions } from "./questions.mjs";
import { sections } from "./sections.mjs";

const root = process.cwd();
const dir = join(root, "docs", "legal-briefing");
const b64 = (p) => readFileSync(join(root, p)).toString("base64");

const fonts = [
  `@font-face{font-family:"Bricolage Grotesque";font-weight:700;src:url(data:font/ttf;base64,${b64("src/lib/receipts/fonts/BricolageGrotesque-Bold.ttf")}) format("truetype");}`,
  `@font-face{font-family:"Bricolage Grotesque";font-weight:800;src:url(data:font/ttf;base64,${b64("apps/mobile/assets/fonts/BricolageGrotesque-ExtraBold.ttf")}) format("truetype");}`,
  ...[400, 500, 600, 700].map(
    (w) => `@font-face{font-family:"DM Sans";font-weight:${w};src:url(data:font/woff2;base64,${b64(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${w}-normal.woff2`)}) format("woff2");}`,
  ),
].join("\n");
const logo = `data:image/png;base64,${b64("public/logo.png")}`;

const pages = JSON.parse(existsSync(join(dir, "samples", "receipt-pages.json")) ? readFileSync(join(dir, "samples", "receipt-pages.json"), "utf8") : "[]");
const psv = readFileSync(join(dir, "samples", "sample-it3d.psv"), "latin1");
const worked = JSON.parse(readFileSync(join(dir, "samples", "worked-example.json"), "utf8"));
const it3dResult = JSON.parse(readFileSync(join(dir, "samples", "sample-it3d-result.json"), "utf8"));
const tests = existsSync(join(dir, "samples", "test-run.json")) ? JSON.parse(readFileSync(join(dir, "samples", "test-run.json"), "utf8")) : null;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ctx = { questions, pages, psv, worked, it3dResult, tests, logo, esc };
const rawBody = sections(ctx);
const tocLinks = ctx.toc.filter((t) => t.level === 1 || t.key.startsWith("s4_9") || t.key === "s5_5");
const tocHtml = `<ul class="toc">${ctx.toc.map((t) => `<li class="${t.level === 1 ? "top" : "sub"}"><span class="t">${t.text}</span><span class="d"></span><span class="p">{{P:${t.key}}}</span></li>`).join("")}</ul>`;
const body = rawBody.replace("<!--TOC-->", tocHtml);
writeFileSync(join(dir, "samples", "toc.json"), JSON.stringify(ctx.toc.map((t) => ({ key: t.key, text: t.text.replace(/<[^>]+>/g, "") }))));

const qById = Object.fromEntries(questions.map((q) => [q.key, q]));
const qkeyToId = (key) => {
  const sec = key.split(":")[0];
  const found = questions.find((q) => `${q.section}:${q.key}` === key);
  if (!found) throw new Error(`Unknown question ${key}`);
  return found.id;
};

let html = readFileSync(join(dir, "template.html"), "utf8")
  .replace("/*FONTS*/", fonts)
  .replace("<!--BODY-->", body)
  .replace(/\{\{Q:([0-9]+:[a-z]+)\}\}/g, (_, k) => qkeyToId(k));

// Page numbers for the contents list: filled from the last render (pages.json), else left blank.
const pn = existsSync(join(dir, "samples", "page-numbers.json")) ? JSON.parse(readFileSync(join(dir, "samples", "page-numbers.json"), "utf8")) : {};
html = html.replace(/\{\{P:([A-Za-z0-9_.-]+)\}\}/g, (_, k) => (pn[k] ? String(pn[k]) : ""));

const bad = html.match(/\{\{[^}]*\}\}/g);
if (bad) throw new Error(`Unresolved placeholders: ${[...new Set(bad)].join(", ")}`);
writeFileSync(join(dir, "briefing.html"), html);
console.log("briefing.html written", (html.length / 1e6).toFixed(2), "MB;", questions.length, "questions");
