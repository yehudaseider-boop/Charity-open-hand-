/**
 * The "Donor journeys" area of the charity dashboard (23/11/2026, Yehuda's meeting: "all can be piled into one ...
 * tab"): the four pages about keeping in touch with donors, under one menu item, with a row of tabs on each.
 * Donors stays its own page. The pages keep their own addresses, so old links still work. Pure.
 */

export const DONOR_JOURNEY_PAGES = [
  { href: "/journey", label: "Journeys" },
  { href: "/keeping", label: "Keeping donors" },
  { href: "/thank-donors", label: "Thank donors" },
  { href: "/email-donors", label: "Email donors" },
] as const;

export type DonorJourneyPage = (typeof DONOR_JOURNEY_PAGES)[number]["href"];

/** The area's pages this person can use (a page their role can't use is hidden, as in the menu). */
export function visibleDonorJourneyPages(hidden: readonly string[]) {
  return DONOR_JOURNEY_PAGES.filter((p) => !hidden.includes(p.href));
}

/** Where the menu's "Donor journeys" opens: the first page this person can use, or null when none. */
export function donorJourneysHref(hidden: readonly string[]): DonorJourneyPage | null {
  return visibleDonorJourneyPages(hidden)[0]?.href ?? null;
}

/** Whether a dashboard path (after /charity-admin/<id>) is in the area, including pages under it. */
export function inDonorJourneys(path: string): boolean {
  return DONOR_JOURNEY_PAGES.some((p) => path === p.href || path.startsWith(`${p.href}/`));
}

/** The tab row: every page this person can use, the current one marked. */
export function donorJourneyTabItems(base: string, current: DonorJourneyPage, hidden: readonly string[]) {
  return visibleDonorJourneyPages(hidden).map((p) => ({ href: `${base}${p.href}`, label: p.label, active: p.href === current }));
}
