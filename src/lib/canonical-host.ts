/**
 * One address for the whole site. The site can be reached on more than one address (the hosting
 * company's own and ours), but a sign-in link only works on the address it was asked for from, and
 * sign-in links always point at SITE_URL. So pages opened on any other address move to SITE_URL first
 * (decided 27/10/2026). Payment messages and the app's calls (/api/) are never moved: a redirect
 * would drop them. Only on the deployed site, and only for page visits (GET), never a form being sent.
 */
export function canonicalRedirect(url: URL, method: string, site: string | undefined, deployed: boolean): string | null {
  if (!deployed || !site || (method !== "GET" && method !== "HEAD")) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  let target: URL;
  try {
    target = new URL(site);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" || target.host === url.host) return null;
  return `${target.origin}${url.pathname}${url.search}`;
}

/**
 * A stray backslash in the address ("/charities\\", from a mistyped or badly copied link) made the hosting crash
 * with an error page (seen 11/11/2026, found again 17/11/2026). Page visits with one move to the same address without
 * it, so the visitor lands on the page they meant. Only page visits (GET and HEAD); the API is left alone.
 */
export function backslashRedirect(url: URL, method: string): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;
  if (!/%5c|\\/i.test(url.pathname)) return null;
  const clean = url.pathname.replace(/(%5c|\\)+/gi, "/").replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
  return `${clean || "/"}${url.search}`;
}
