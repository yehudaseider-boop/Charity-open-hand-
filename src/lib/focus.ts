/**
 * Focused giving: someone who arrives from a charity's own link (its website button, a shared link,
 * WhatsApp or the QR poster) sees only that charity. No menu to other charities, no "Find a charity",
 * until they choose to leave (decided 27/10/2026). The proxy notes the charity in a short cookie; the
 * header, footer and thank-you page read it. Pure, so it is tested without a request.
 */
import { SOURCE_PARAM, sourceTag } from "@/lib/donations/source";

export const FOCUS_COOKIE = "gz_focus";
/** Long enough to give and come back from the payment page, short enough not to follow them around. */
export const FOCUS_SECONDS = 3 * 60 * 60;

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const CHARITY_PATH = /^\/c\/([^/]+)(?:\/donate)?\/?$/;
/** A path segment as text; a broken %-escape is just not a slug. */
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return ""; } };

/** What a page request does to focus: start it for a charity, end it, or leave it as it is. */
export function focusChange(pathname: string, src: string | null): { set: string } | "clear" | null {
  if (pathname === "/" || pathname === "/charities" || pathname.startsWith("/charities/")) return "clear";
  const m = CHARITY_PATH.exec(pathname);
  if (!m || !sourceTag(src)) return null;
  const slug = decode(m[1]);
  return SLUG.test(slug) ? { set: slug } : null;
}

/**
 * The charity the page is focused on, or null. Only on that charity's own pages and the thank-you
 * page after paying: anywhere else on Givezy the full site shows as usual.
 */
export function focusedSlug(path: string | null | undefined, cookie: string | null | undefined): string | null {
  if (!cookie || !SLUG.test(cookie) || !path) return null;
  const pathname = path.split("?")[0];
  if (pathname === "/donate/return" || pathname.startsWith("/donate/return/")) return cookie;
  const m = /^\/c\/([^/]+)/.exec(pathname);
  return m && decode(m[1]) === cookie ? cookie : null;
}

/** The focus for a page request: the request's own link wins (the cookie is only set on its reply). */
export function focusFor(path: string | null | undefined, cookie: string | null | undefined): string | null {
  if (!path) return null;
  const [pathname, query = ""] = path.split("?");
  const change = focusChange(pathname, new URLSearchParams(query).get(SOURCE_PARAM));
  if (change === "clear") return null;
  return focusedSlug(path, change ? change.set : cookie);
}
