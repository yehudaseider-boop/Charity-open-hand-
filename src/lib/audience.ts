/**
 * The two sides of the public site (10/11/2026). The landing page (/) has two doors, "I give" (#give) and "I run a
 * charity" (#charity); /for-charities is the longer charity page, still there by link. Dependency-free.
 */

export type Audience = "give" | "charity";

export const AUDIENCE_PATHS: Record<Audience, string> = { give: "/#give", charity: "/for-charities" };

export const AUDIENCE_LABELS: Record<Audience, string> = { give: "I give", charity: "I run a charity" };

/**
 * Where a visit with ?for= should go instead (10/11/2026, the two-door landing page): "/?for=charity" opens the charity
 * door on the landing page (/#charity) and "/?for=give" the giver's door (/#give); "/for-charities?for=give" goes to
 * the giver's door too, and "/for-charities?for=charity" just drops the parameter. Every other parameter is kept, so
 * the landing page stays one page served from cache. Only GET and HEAD, and only these two pages.
 */
export function audienceRedirect(url: URL, method: string): URL | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const wanted = url.searchParams.get("for");
  if (wanted === null) return null;
  if (url.pathname !== "/" && url.pathname !== "/for-charities") return null;
  const target: Audience = wanted === "charity" ? "charity" : "give";
  const to = new URL(url.toString());
  to.searchParams.delete("for");
  if (url.pathname === "/for-charities" && target === "charity") return to;
  to.pathname = "/";
  to.hash = target;
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
