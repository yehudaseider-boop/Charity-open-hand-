/**
 * The two sides of the public site (10/11/2026): "I give" is the home page and "I run a charity" is /for-charities.
 * Separate pages, so each is built once and served from cache. A shared link with ?for=charity or ?for=give lands on
 * the right page. Dependency-free.
 */

export type Audience = "give" | "charity";

export const AUDIENCE_PATHS: Record<Audience, string> = { give: "/", charity: "/for-charities" };

export const AUDIENCE_LABELS: Record<Audience, string> = { give: "I give", charity: "I run a charity" };

/**
 * Where a visit to "/" or "/for-charities" with ?for= should go instead, keeping every other parameter, or null to
 * stay. Only GET and HEAD, and only the two pages.
 */
export function audienceRedirect(url: URL, method: string): URL | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const wanted = url.searchParams.get("for");
  if (wanted === null) return null;
  const onPage = (Object.keys(AUDIENCE_PATHS) as Audience[]).find((a) => AUDIENCE_PATHS[a] === url.pathname);
  if (!onPage) return null;
  const target: Audience = wanted === "charity" ? "charity" : "give";
  const to = new URL(url.toString());
  to.pathname = AUDIENCE_PATHS[target];
  to.searchParams.delete("for");
  return to;
}

/** The app area of the home page: store buttons once the links are set, otherwise "coming soon". */
export function appCta(links: { appStoreUrl: string | null; playStoreUrl: string | null }):
  | { kind: "stores"; stores: { label: string; href: string }[] }
  | { kind: "soon"; text: string } {
  const stores = [
    links.appStoreUrl ? { label: "App Store", href: links.appStoreUrl } : null,
    links.playStoreUrl ? { label: "Google Play", href: links.playStoreUrl } : null,
  ].filter((s): s is { label: string; href: string } => s !== null);
  if (stores.length === 0) return { kind: "soon", text: "Coming soon to the App Store and Google Play" };
  return { kind: "stores", stores };
}
