import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The receipt's own fonts, for the charity's on-screen preview of an s18A receipt (09/11/2026). The PDF embeds
 * them (pdf.ts loadFontCss); the website's security policy only lets a page load fonts from Givezy itself, so the
 * preview loads these same files from here. Public: they are open-licence fonts, nothing private.
 */
const FILES: Record<string, { path: string[]; type: string }> = {
  "bricolage-700.ttf": { path: ["src", "lib", "receipts", "fonts", "BricolageGrotesque-Bold.ttf"], type: "font/ttf" },
  "dm-sans-400.woff2": { path: ["node_modules", "@fontsource", "dm-sans", "files", "dm-sans-latin-400-normal.woff2"], type: "font/woff2" },
  "dm-sans-500.woff2": { path: ["node_modules", "@fontsource", "dm-sans", "files", "dm-sans-latin-500-normal.woff2"], type: "font/woff2" },
  "dm-sans-600.woff2": { path: ["node_modules", "@fontsource", "dm-sans", "files", "dm-sans-latin-600-normal.woff2"], type: "font/woff2" },
};

export async function GET(_req: NextRequest, ctx: RouteContext<"/receipt-fonts/[file]">) {
  const { file } = await ctx.params;
  const f = Object.hasOwn(FILES, file) ? FILES[file] : null;
  if (!f) return new NextResponse("Not found", { status: 404 });
  const body = await readFile(join(process.cwd(), ...f.path));
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": f.type, "Cache-Control": "public, max-age=31536000, immutable" } });
}
