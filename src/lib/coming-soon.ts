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
/**
 * Picture files at the top of the site (icon.png, apple-icon.png, logo.png). Only there: a deeper address ending in .png
 * is a page, not a file (19/11/2026: /demo/dashboard/x.png rendered the demo dashboard past these rules).
 */
const STATIC_FILE = /^\/[^/]+\.(?:svg|png|jpe?g|gif|webp|ico)$/i;

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

/**
 * The charity sign-up path stays open on a coming-soon address (Yehuda, 17/11/2026): a charity can apply, sign in with
 * the emailed code, finish its application, read the policies and try the demo dashboard (made-up data). Everything else (donating, the charity list, the
 * app's and payment provider's calls) stays closed. These pages post to themselves (server actions), so they take
 * any method.
 */
const CHARITY_SIGN_UP_PATHS = ["/apply", "/login", "/auth", "/charity-admin", "/mfa", "/agree", "/documents", "/demo"];
/** The policies and the launch list's unsubscribe link: open while charities can apply or givers can join the list. */
const POLICY_PATHS = ["/privacy", "/terms", "/launch-list/stop"];

const under = (list: string[], pathname: string) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * What a coming-soon address opens besides its page (19/11/2026). Both off by default: then the address shows its one
 * page and nothing else, so nobody ever lands on the full site from it. `signUp` follows CHARITY_SIGNUP=yes,
 * `policies` follows CHARITY_SIGNUP=yes or LAUNCH_LIST=yes (people giving their details must be able to read them).
 */
export type ComingSoonOpen = { signUp: boolean; policies: boolean; launchList?: boolean };
const CLOSED: ComingSoonOpen = { signUp: false, policies: false, launchList: false };

/** A path a coming-soon address still serves as it is. */
function isAllowedFile(pathname: string): boolean {
  return (
    pathname === "/robots.txt" ||
    pathname.startsWith("/_next/") ||
    pathname === "/opengraph-image" ||
    pathname.startsWith("/opengraph-image-") ||
    // The pre-launch page's own share picture (src/app/coming-soon/opengraph-image.tsx).
    pathname === "/coming-soon/opengraph-image" ||
    pathname.startsWith("/coming-soon/opengraph-image-") ||
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/home/") ||
    STATIC_FILE.test(pathname)
  );
}

/**
 * What to do with a request. `deployed` is true only on the hosted production site (like the one-address rule in
 * canonical-host.ts), so a developer's own machine and every preview behave normally.
 */
export function comingSoonAction(url: URL, method: string, setting: string | undefined, deployed: boolean, open: ComingSoonOpen = CLOSED, serverAction = false): ComingSoonAction {
  if (!deployed || !isComingSoonHost(url.hostname, setting)) return "pass-through";
  const pathname = url.pathname;
  // Technical files first, so robots.txt and the logo work for any method a browser or crawler uses.
  if (isAllowedFile(pathname) && (method === "GET" || method === "HEAD")) return "pass-through";
  // The charity sign-up path (see above), and the one call its header makes to know who is signed in.
  if (open.signUp && (under(CHARITY_SIGN_UP_PATHS, pathname) || (pathname === "/api/viewer" && (method === "GET" || method === "HEAD")))) return "pass-through";
  if ((open.signUp || open.policies) && under(POLICY_PATHS, pathname)) return "pass-through";
  // The app's and the payment provider's calls never come here (they use the other addresses): refuse them, don't redirect
  // them, because a redirect would be followed as if it were an answer.
  if (pathname === "/api" || pathname.startsWith("/api/")) return "not-found";
  // The launch list's form posts to the page it is on (a server action, sent with a Next-Action header). While the
  // list is open, that one post reaches the page; any other post to it is refused (review 19/11/2026: before, the
  // first giver to type an email got "Not found").
  if (pathname === "/" && method === "POST" && serverAction && open.launchList) return "serve";
  if (method !== "GET" && method !== "HEAD") return "not-found";
  if (pathname === "/") return "serve";
  return "redirect-home";
}

/**
 * A coming-soon address keeps its visitors: its open pages are never moved on to SITE_URL (the test site until launch),
 * so nobody is sent from givezy.co.za into the full test site (19/11/2026: Privacy there went to test.givezy.co.za).
 */
export function staysOnComingSoonHost(url: URL, setting: string | undefined, deployed: boolean): boolean {
  return deployed && isComingSoonHost(url.hostname, setting);
}
