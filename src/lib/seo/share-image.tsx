import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { art as drawings } from "@/components/illustration-art";
import { brandColors } from "@/lib/brand-colors";

/**
 * The picture shown when a Givezy link is shared (WhatsApp, LinkedIn, Facebook, X, iMessage): the
 * Givezy look at 1 200 x 630, a headline on the left and a blue colour block with the logo's
 * splashes on the right. A charity's page shows its own cover photo, or its initials on a white tile.
 */
export const shareImageSize = { width: 1200, height: 630 };
export const shareImageType = "image/png";

const file = (...p: string[]) => readFile(join(process.cwd(), ...p));
const dataUrl = (b: Buffer, type = "image/png") => `data:${type};base64,${b.toString("base64")}`;

async function assets() {
  const [display, body, bodyBold, logo, orange, lilac, blue] = await Promise.all([
    file("src/lib/seo/fonts/bricolage-grotesque-latin-800-normal.woff"),
    file("src/lib/seo/fonts/dm-sans-latin-500-normal.woff"),
    file("src/lib/seo/fonts/dm-sans-latin-700-normal.woff"),
    file("public/logo.png"),
    file("public/brand/drop-orange.png"),
    file("public/brand/drop-lilac.png"),
    file("public/brand/drop-blue.png"),
  ]);
  return {
    fonts: [
      { name: "Display", data: display, weight: 800 as const, style: "normal" as const },
      { name: "Body", data: body, weight: 500 as const, style: "normal" as const },
      { name: "Body", data: bodyBold, weight: 700 as const, style: "normal" as const },
    ],
    logo: dataUrl(logo),
    orange: dataUrl(orange),
    lilac: dataUrl(lilac),
    blue: dataUrl(blue),
  };
}

export type ShareArt = { photo: string } | { initials: string } | { person: keyof typeof drawings };

/**
 * One of the website's unDraw people as an image the renderer can read: the CSS colour variables it uses on the
 * website swapped for the same brand colours, and its own size kept so it isn't stretched.
 */
export function personImage(name: keyof typeof drawings): { src: string; ratio: number } {
  const c = brandColors;
  const colours: Record<string, string> = { "--brand": c.blue, "--brand-soft": c.blueSoft, "--coral": c.orange, "--honey": c.lilac, "--honey-soft": c.lilacSoft, "--navy": c.ink };
  const svg = drawings[name]
    .replace(/var\((--[a-z-]+)\)/g, (m, v: string) => colours[v] ?? m)
    .replace(/ width="100%"/, "");
  const box = svg.match(/viewBox="[\d.\s-]*?([\d.]+) ([\d.]+)"/);
  const ratio = box ? Number(box[1]) / Number(box[2]) : 1;
  return { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, ratio };
}

/** Headline font size that keeps a long charity name to three lines. */
export function headlineSize(text: string): number {
  if (text.length <= 28) return 76;
  if (text.length <= 48) return 64;
  if (text.length <= 72) return 54;
  return 46;
}

/** A headline: plain words, and words in logo blue (the website's <Key>). */
export type Headline = (string | { blue: string })[];

/**
 * The headline, word by word. The image renderer lays out each piece as a box, so mixed colours in one line
 * would run together; one box per word keeps the spaces and lets long names wrap.
 */
function words(headline: Headline, size: number): ReactNode[] {
  return headline.flatMap((part, i) => {
    const blue = typeof part !== "string";
    const text = blue ? part.blue : part;
    return text
      .split(/\s+/)
      .filter(Boolean)
      .map((w, j) => (
        <span key={`${i}-${j}`} style={{ color: blue ? brandColors.blue : brandColors.ink, marginRight: size * 0.24 }}>
          {w}
        </span>
      ));
  });
}

export const headlineText = (headline: Headline) => headline.map((p) => (typeof p === "string" ? p : p.blue)).join(" ").replace(/\s+/g, " ").trim();

export async function shareImage({ headline, subline, art, tick }: {
  headline: Headline;
  subline: string;
  art: ShareArt;
  /** A short green-ticked line under the subline, e.g. "s18A receipts". */
  tick?: string;
}): Promise<ImageResponse> {
  const a = await assets();
  const c = brandColors;
  const size = headlineSize(headlineText(headline));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FFFFFF", position: "relative", fontFamily: "Body" }}>
        {/* Soft peach and lilac splashes behind the words. */}
        <div style={{ position: "absolute", left: -120, top: -140, width: 360, height: 360, borderRadius: 999, background: c.peach, display: "flex" }} />
        <div style={{ position: "absolute", left: 520, bottom: -90, width: 180, height: 180, borderRadius: 999, background: c.lilacSoft, display: "flex" }} />

        {/* The blue colour block, bleeding off the right edge, with the logo's splashes. */}
        <div style={{ position: "absolute", right: -60, top: 40, width: 470, height: 620, borderRadius: 64, background: c.blue, display: "flex" }} />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={a.orange} width={150} height={184} style={{ position: "absolute", right: 300, top: 10 }} />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={a.lilac} width={70} height={128} style={{ position: "absolute", right: 30, bottom: -30 }} />

        {"photo" in art ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={art.photo} width={400} height={400} style={{ position: "absolute", right: 70, top: 130, borderRadius: 48, objectFit: "cover", border: "8px solid #FFFFFF" }} />
        ) : "initials" in art ? (
          <div style={{ position: "absolute", right: 110, top: 170, width: 320, height: 320, borderRadius: 56, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 10px 0 ${c.blueEdge}` }}>
            <span style={{ fontFamily: "Display", fontSize: 128, color: c.blue }}>{art.initials}</span>
          </div>
        ) : (
          <PersonCard name={art.person} />
        )}

        {/* The words. */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 56px 72px", width: 660, height: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={a.logo} width={188} height={62} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontFamily: "Display", fontSize: size, lineHeight: 1.05, color: c.ink, letterSpacing: -1 }}>{words(headline, size)}</div>
            <div style={{ display: "flex", fontSize: 30, lineHeight: 1.35, color: c.muted }}>{subline}</div>
            {tick ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, fontWeight: 700, color: c.successText }}>
                <span style={{ display: "flex", width: 34, height: 34, borderRadius: 999, background: c.successSoft, alignItems: "center", justifyContent: "center" }}><Tick size={18} /></span>
                {tick}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: c.blue }}>givezy.co.za</div>
        </div>
      </div>
    ),
    { ...shareImageSize, fonts: a.fonts },
  );
}

function Tick({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={brandColors.sage} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** A white card on the blue block with one of the website's people standing in it. */
function PersonCard({ name }: { name: keyof typeof drawings }) {
  const p = personImage(name);
  const h = 340;
  const w = Math.min(330, Math.round(h * p.ratio));
  return (
    <div style={{ position: "absolute", right: 90, top: 150, width: 360, height: 400, borderRadius: 56, background: "#FFFFFF", display: "flex", alignItems: "flex-end", justifyContent: "center", boxShadow: `0 10px 0 ${brandColors.blueEdge}`, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -40, bottom: -60, width: 200, height: 200, borderRadius: 999, background: brandColors.peach, display: "flex" }} />
      <div style={{ position: "absolute", right: 30, top: 34, width: 22, height: 22, borderRadius: 999, background: brandColors.orange, display: "flex" }} />
      <div style={{ position: "absolute", right: 64, top: 70, width: 14, height: 14, borderRadius: 999, border: `4px solid ${brandColors.blue}`, display: "flex" }} />
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={p.src} width={w} height={Math.round(w / p.ratio)} style={{ position: "relative", marginBottom: 10 }} />
    </div>
  );
}
