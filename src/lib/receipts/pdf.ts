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
  // Bricolage Grotesque is a TrueType file kept next to this code (the same file as the phone app's).
  const bricolage = readFileSync(join(process.cwd(), "src", "lib", "receipts", "fonts", "BricolageGrotesque-Bold.ttf")).toString("base64");
  // The brand fonts: Bricolage Grotesque for the title and the total, DM Sans for every field.
  return [
    `@font-face{font-family:"Bricolage Grotesque";font-weight:700;font-style:normal;src:url(data:font/ttf;base64,${bricolage}) format("truetype");}`,
    face("DM Sans", 400, "@fontsource/dm-sans", "dm-sans-latin-400-normal.woff2", latin),
    face("DM Sans", 500, "@fontsource/dm-sans", "dm-sans-latin-500-normal.woff2", latin),
    face("DM Sans", 600, "@fontsource/dm-sans", "dm-sans-latin-600-normal.woff2", latin),
  ].join("\n");
}

/** The Givezy logo as an embedded image, for the top left of a receipt. */
export function loadLogoHtml(): string {
  const b64 = readFileSync(join(process.cwd(), "public", "logo.png")).toString("base64");
  return `<img src="data:image/png;base64,${b64}" alt="Givezy">`;
}

/**
 * Which Chrome prints the PDF. CHROME_PATH (a local machine, the receipts command) wins. On the hosted site
 * (Vercel) there is no Chrome, so a Chromium made for serverless hosts (@sparticuz/chromium) is unpacked and used.
 */
async function chrome(): Promise<{ executablePath: string; args: string[] }> {
  if (process.env.CHROME_PATH) {
    // Only containers without a sandbox need CHROME_NO_SANDBOX=yes.
    return { executablePath: process.env.CHROME_PATH, args: process.env.CHROME_NO_SANDBOX === "yes" ? ["--no-sandbox"] : [] };
  }
  if (process.env.VERCEL) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return { executablePath: await serverless.executablePath(), args: serverless.args };
  }
  throw new Error("Set CHROME_PATH to a Chrome or Chromium executable to make receipt PDFs.");
}

/** Print HTML to an A4 PDF with headless Chrome. */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch(await chrome());
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
