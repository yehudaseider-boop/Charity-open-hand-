/**
 * Where a request came from, by the headers the browser sets (a page on another site can't change them).
 * Pure, so the tests can check it; give it the request's headers (`req.headers`, or `await headers()`).
 */
type HeaderReader = { get(name: string): string | null };

/**
 * Strict: only this site's own page. The browser's Origin must be this site, or, when a browser sends no Origin,
 * Sec-Fetch-Site must say same-origin. A request with neither is refused like one from another site.
 * For a POST that carries something secret (the SARS file).
 */
export function fromThisSite(h: HeaderReader): boolean {
  const origin = h.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === h.get("host");
    } catch {
      return false;
    }
  }
  return h.get("sec-fetch-site") === "same-origin";
}

/**
 * For downloads (a link on the dashboard): true only when the browser says the request was started by another
 * site, by a foreign Origin or Sec-Fetch-Site "cross-site". A click on our own page (same-origin or same-site),
 * an address typed in or a bookmark ("none"), and older browsers that send neither header still work.
 */
export function crossSiteRequest(h: HeaderReader): boolean {
  const origin = h.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== h.get("host")) return true; // "null" (a sandboxed frame) fails to parse: refused too
    } catch {
      return true;
    }
  }
  return h.get("sec-fetch-site") === "cross-site";
}
