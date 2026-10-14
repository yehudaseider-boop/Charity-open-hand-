import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

/** Embedded @font-face rules, so the PDF looks the same on any machine. */
export function loadFontCss(): string {
  const face = (family: string, weight: number, pkg: string, file: string, unicodeRange: string) => {
    const b64 = readFileSync(join(process.cwd(), "node_modules", pkg, "files", file)).toString("base64");
    return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${unicodeRange};}`;
  };
  const latin = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  const hebrew = "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F";
  // The brand fonts: Fraunces for the title, Inter for every field, Heebo for any Hebrew.
  return [
    face("Fraunces", 600, "@fontsource/fraunces", "fraunces-latin-600-normal.woff2", latin),
    face("Inter", 400, "@fontsource/inter", "inter-latin-400-normal.woff2", latin),
    face("Inter", 500, "@fontsource/inter", "inter-latin-500-normal.woff2", latin),
    face("Inter", 600, "@fontsource/inter", "inter-latin-600-normal.woff2", latin),
    face("Heebo", 400, "@fontsource/heebo", "heebo-hebrew-400-normal.woff2", hebrew),
    face("Heebo", 600, "@fontsource/heebo", "heebo-hebrew-600-normal.woff2", hebrew),
  ].join("\n");
}

/** The Nadiv Lev wordmark as inline SVG, for the top left of a receipt. */
export function loadLogoSvg(): string {
  return readFileSync(join(process.cwd(), "public", "brand", "nadiv-lev.svg"), "utf8");
}

/** Print HTML to an A4 PDF with headless Chrome. CHROME_PATH points at the Chrome or Chromium to use. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) throw new Error("Set CHROME_PATH to a Chrome or Chromium executable to make receipt PDFs.");
  // Only containers without a sandbox need CHROME_NO_SANDBOX=yes.
  const browser = await chromium.launch({ executablePath, args: process.env.CHROME_NO_SANDBOX === "yes" ? ["--no-sandbox"] : [] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
