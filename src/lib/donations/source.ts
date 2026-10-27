/**
 * Where a gift came from, for the charity's dashboard: the website, the app, a link shared on WhatsApp
 * or elsewhere, the QR poster, or the "Give with Givezy" button on the charity's own website. A link
 * carries `?src=` (whatsapp, link, qr or button); the donor's pages pass it on to the payment and it
 * is kept on the gift. Only these values are ever stored.
 * No imports, so the app's share code can use the same tags.
 */

export const SOURCE_PARAM = "src";

/** The tag on a shared link, and what it is stored as. */
const TAGS = { whatsapp: "whatsapp", link: "share_link", qr: "qr", button: "website_button" } as const;
export type SourceTag = keyof typeof TAGS;

export const GIFT_SOURCES = {
  website: "Website",
  app: "App",
  whatsapp: "WhatsApp",
  share_link: "Shared link",
  qr: "QR poster",
  website_button: "Website button",
  recorded: "Recorded by you",
} as const;
export type GiftSource = keyof typeof GIFT_SOURCES;
export const isGiftSource = (s: unknown): s is GiftSource => typeof s === "string" && Object.hasOwn(GIFT_SOURCES, s);

/** A `?src=` value as typed in a link: one of the known tags, or nothing. */
export function sourceTag(v: unknown): SourceTag | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && Object.hasOwn(TAGS, s) ? (s as SourceTag) : null;
}

/** What a gift started on Givezy is stored as. The app always counts as the app. */
export function cameFromOf(args: { fromApp?: boolean; tag?: string | null }): Exclude<GiftSource, "recorded"> {
  if (args.fromApp) return "app";
  const tag = sourceTag(args.tag);
  return tag ? TAGS[tag] : "website";
}

/** The tag a stored source came from, so "Try again" keeps it (the website and the app have none). */
export function tagOf(cameFrom: string | null | undefined): SourceTag | null {
  const hit = (Object.keys(TAGS) as SourceTag[]).find((t) => TAGS[t] === cameFrom);
  return hit ?? null;
}

/** A link with its source tag added (or kept as it is without one). */
export function withSource(url: string, tag: SourceTag | null | undefined): string {
  if (!tag) return url;
  const [path, hash] = url.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}${SOURCE_PARAM}=${tag}${hash !== undefined ? `#${hash}` : ""}`;
}

/** The label shown for a gift's source; older gifts (before 21/10/2026) have none. */
export function giftSourceLabel(cameFrom: string | null | undefined): string {
  return isGiftSource(cameFrom) ? GIFT_SOURCES[cameFrom] : "Not known";
}
