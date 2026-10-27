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
