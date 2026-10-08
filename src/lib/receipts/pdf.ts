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
  return [
    face("Noto Sans", 400, "@fontsource/noto-sans", "noto-sans-latin-400-normal.woff2", latin),
    face("Noto Sans", 700, "@fontsource/noto-sans", "noto-sans-latin-700-normal.woff2", latin),
    face("Noto Sans Hebrew", 400, "@fontsource/noto-sans-hebrew", "noto-sans-hebrew-hebrew-400-normal.woff2", hebrew),
    face("Noto Sans Hebrew", 700, "@fontsource/noto-sans-hebrew", "noto-sans-hebrew-hebrew-700-normal.woff2", hebrew),
  ].join("\n");
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
