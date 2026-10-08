import type { GivingKind } from "@/data/giving";

/**
 * The website address, set with EXPO_PUBLIC_SITE_URL when we have a domain.
 * Payments happen ONLY on the website (App Store rule): the app never shows
 * an amount to pay, card fields or a pay button.
 */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/** The charity's donation page, with the donor's maaser/chomesh/tzedaka choice carried over. */
export function donateUrl(site: string | undefined, slug: string, kind: GivingKind): string | null {
  if (!site || !site.startsWith("https://")) return null;
  return `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}/donate?kind=${kind}&from=app`;
}
