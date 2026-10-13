// Relative import: the website's tests compile this file, where "@/" means the website.
import type { GivingKind } from "../data/giving";

/**
 * The website address, set with EXPO_PUBLIC_SITE_URL when we have a domain.
 * Payments happen on our website's payment page only. The app has no card fields
 * and never handles card details: it opens that page (in the phone's browser, or in
 * an in-app sheet when the in-app giving switch is on, see give-flow.ts).
 */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/** The charity's donation page, with the donor's maaser/chomesh/tzedaka choice carried over. */
export function donateUrl(site: string | undefined, slug: string, kind: GivingKind): string | null {
  if (!site || !site.startsWith("https://")) return null;
  return `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}/donate?kind=${kind}&from=app`;
}

/** Any page on the website (privacy, terms, account), or null until the site is live. */
export function siteUrl(site: string | undefined, path: string): string | null {
  if (!site || !site.startsWith("https://") || !path.startsWith("/")) return null;
  return `${site.replace(/\/+$/, "")}${path}`;
}
