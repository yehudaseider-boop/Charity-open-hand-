/**
 * Builds the charity portal prototype as ONE self-contained HTML page (script, styles and logo
 * images inlined), so it can be opened and clicked through without running the website, for
 * example as a shared preview page.
 *
 *   node scripts/build-portal-artifact.mjs <output.html>
 *
 * Same screens and demo data as /portal-demo. Next.js routing is replaced by an in-page router
 * (src/portal-demo/artifact). Demo data only: nothing here talks to a database or gateway.
 */
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/build-portal-artifact.mjs <output.html>");
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, "..");

const js = await build({
  entryPoints: [path.join(root, "src/portal-demo/artifact/entry.tsx")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  jsx: "automatic",
  target: "es2020",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: {
    "next/link": path.join(root, "src/portal-demo/artifact/next-link.tsx"),
    "next/navigation": path.join(root, "src/portal-demo/artifact/next-navigation.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "var process={env:{}};" },
  logLevel: "warning",
});

const cssSource = path.join(root, "src/app/globals.css");
const css = await postcss([tailwind({ base: root })]).process(readFileSync(cssSource, "utf8"), { from: cssSource });

const dataUri = (file) => `data:image/png;base64,${readFileSync(path.join(root, "public/givezy", file)).toString("base64")}`;
let script = js.outputFiles[0].text;
for (const file of ["logo.png", "logo-splash.png"]) script = script.split(`/givezy/${file}`).join(dataUri(file));
// Keep a literal "</script>" inside the bundle from closing the tag early.
script = script.replace(/<\/script/gi, "<\\/script");

const html = `<title>Givezy Charity Portal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&family=Inter:wght@400;500;600;700&display=swap">
<style>
${css.css}
/* Single-page build: font variables the Next.js layout normally sets, and a fixed light page. */
:root { --font-inter: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; --font-fredoka: "Fredoka", "Inter", system-ui, sans-serif; color-scheme: light; }
html, body { background: #fefdf7; }
body { margin: 0; }
.gz-portal header.sticky { top: env(safe-area-inset-top, 0px); }
</style>
<div id="gz-root"></div>
<script>${script}</script>
`;
writeFileSync(out, html);
console.log(`Wrote ${out} (${Math.round(html.length / 1024)} KB)`);
