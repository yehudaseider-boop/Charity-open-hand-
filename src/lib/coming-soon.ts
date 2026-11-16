/**
 * "Coming soon" mode for the public address (Yehuda, 11/11/2026): until launch, givezy.co.za shows one landing page
 * and nothing else, while test.givezy.co.za and the hosting company's own address stay the full site.
 *
 * It is a switch in the environment, not in the code: COMING_SOON_HOSTS lists the addresses (comma-separated, for
 * example "givezy.co.za"). Unset or empty, nothing changes anywhere. Pure and dependency-free so the proxy and the
 * tests share one rule. See docs/decisions.md and docs/go-live-checklist.md ("Launch day").
 */

/** What the proxy does with a request. */
export type ComingSoonAction =
  /** Not a coming-soon address (or the switch is off): the site works as normal. */
  | "pass-through"
  /** The front page of a coming-soon address: show the coming-soon page, address unchanged. */
  | "serve"
  /** Any other page on a coming-soon address: back to the front page (temporary redirect). */
  | "redirect-home"
  /** The app's and the payment provider's calls, and anything that isn't a page visit: a plain 404, never a redirect. */
  | "not-found";

/** The route that holds the coming-soon page. */
export const COMING_SOON_ROUTE = "/coming-soon";

/** Files a coming-soon address still serves: the logo and pictures, the share picture, icons, robots.txt. */
const STATIC_FILE = /\.(?:svg|png|jpe?g|gif|webp|ico)$/i;

/** The addresses in the setting as bare lower-case host names ("https://Givezy.co.za:443/x" becomes "givezy.co.za"). */
export function comingSoonHosts(setting: string | undefined): string[] {
  return (setting ?? "")
    .split(",")
    .map((h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
        .replace(/[/?#].*$/, "")
        .replace(/:\d+$/, "")
        .replace(/\.$/, ""),
    )
    .filter(Boolean);
}

/** Whether this host is a coming-soon address. "www." of a listed address counts, so it can never show the full site. */
export function isComingSoonHost(hostname: string, setting: string | undefined): boolean {
  const list = comingSoonHosts(setting);
  if (list.length === 0) return false;
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return list.some((h) => host === h || host === `www.${h}`);
}

/** A path a coming-soon address still serves as it is. */
function isAllowedFile(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname.startsWith("/_next/") ||
    pathname === "/opengraph-image" ||
    pathname.startsWith("/opengraph-image-") ||
    pathname.startsWith("/brand/") ||
    STATIC_FILE.test(pathname)
  );
}

/**
 * What to do with a request. `deployed` is true only on the hosted production site (like the one-address rule in
 * canonical-host.ts), so a developer's own machine and every preview behave normally.
 */
export function comingSoonAction(url: URL, method: string, setting: string | undefined, deployed: boolean): ComingSoonAction {
  if (!deployed || !isComingSoonHost(url.hostname, setting)) return "pass-through";
  const pathname = url.pathname;
  // Technical files first, so robots.txt and the logo work for any method a browser or crawler uses.
  if (isAllowedFile(pathname) && (method === "GET" || method === "HEAD")) return "pass-through";
  // The app's and the payment provider's calls never come here (they use the other addresses): refuse them, don't redirect
  // them, because a redirect would be followed as if it were an answer.
  if (pathname === "/api" || pathname.startsWith("/api/")) return "not-found";
  if (method !== "GET" && method !== "HEAD") return "not-found";
  if (pathname === "/") return "serve";
  return "redirect-home";
}
