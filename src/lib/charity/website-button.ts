/**
 * The "Give with Givezy" button a charity puts on its own website: a plain link, styled inline so it
 * looks the same on WordPress, Wix, Squarespace or a hand-made site, with no script of ours on their
 * page. It opens the charity's Givezy page tagged `?src=button`, so the page shows only that charity
 * and its gifts show as "Website button". Pure, so it is tested without a request.
 */
import { brandColors } from "@/lib/brand-colors";
import { withSource } from "@/lib/donations/source";

export const BUTTON_STYLES = { blue: "Blue", white: "White" } as const;
export type ButtonStyle = keyof typeof BUTTON_STYLES;
export const BUTTON_LABELS = { give: "Give with Givezy", donate: "Donate" } as const;
export type ButtonLabel = keyof typeof BUTTON_LABELS;

/** The pressable edge under a blue button (the website's --edge for blue). */
const BLUE_EDGE = "#0B2A73";

const pick = <T extends string>(v: unknown, options: Record<T, string>, fallback: T): T =>
  typeof v === "string" && Object.hasOwn(options, v) ? (v as T) : fallback;
export const buttonStyleOf = (v: unknown) => pick<ButtonStyle>(v, BUTTON_STYLES, "blue");
export const buttonLabelOf = (v: unknown) => pick<ButtonLabel>(v, BUTTON_LABELS, "give");

/** Text safe inside an HTML attribute or between tags. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Where the button goes: the charity's page, or straight to giving to one campaign. */
export function buttonTarget(site: string, slug: string, campaignId?: string | null): string {
  const base = `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}`;
  return withSource(campaignId ? `${base}/donate?campaign=${encodeURIComponent(campaignId)}` : base, "button");
}

/** The HTML a charity pastes into its website. */
export function buttonHtml(args: { site: string; slug: string; charityName: string; style: ButtonStyle; label: ButtonLabel; campaignId?: string | null }): string {
  const site = args.site.replace(/\/+$/, "");
  const href = escapeHtml(buttonTarget(site, args.slug, args.campaignId));
  const text = BUTTON_LABELS[args.label];
  const title = escapeHtml(`Give to ${args.charityName} with Givezy`);
  const blue = args.style === "blue";
  const link = [
    "display:inline-flex",
    "align-items:center",
    "gap:10px",
    "padding:10px 20px 10px 10px",
    "border-radius:18px",
    `background:${blue ? brandColors.blue : brandColors.surface}`,
    `color:${blue ? brandColors.surface : brandColors.ink}`,
    blue ? "border:2px solid transparent" : `border:2px solid ${brandColors.hairline}`,
    `box-shadow:0 4px 0 ${blue ? BLUE_EDGE : brandColors.hairline}`,
    "font:700 17px/1.2 'DM Sans',Arial,Helvetica,sans-serif",
    "text-decoration:none",
  ].join(";");
  // The logo's splash sits on white, so all three of its colours show on the blue button too.
  const mark = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "width:40px",
    "height:32px",
    "border-radius:12px",
    `background:${blue ? brandColors.surface : brandColors.lilacSoft}`,
  ].join(";");
  return (
    `<a href="${href}" target="_blank" rel="noopener" title="${title}" style="${link}">` +
    `<span style="${mark}"><img src="${escapeHtml(site)}/brand/splash.png" alt="" width="31" height="22" style="display:block;width:31px;height:22px;border:0"></span>` +
    `${escapeHtml(text)}</a>`
  );
}
