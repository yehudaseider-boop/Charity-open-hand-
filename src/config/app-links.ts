/**
 * Where to get the phone app, and when Givezy launches (10/11/2026). Store links stay null until Yehuda confirms
 * them: the landing page then says the app is coming soon, never a dead link. The launch month was confirmed by
 * Yehuda on 10/11/2026; null hides the line. Never guess these.
 */
export const appLinks: { appStoreUrl: string | null; playStoreUrl: string | null; launchMonth: string | null; launchListOpen: boolean; charityRequestsOpen: boolean } = {
  appStoreUrl: null,
  playStoreUrl: null,
  /** Shown as written on the landing page: "Launching in South Africa, January 2027." */
  launchMonth: "January 2027",
  /**
   * "Notify me at launch" (src/lib/launch-list.ts). Off until migration 20261110000012_launch_list.sql is on the
   * database and Yehuda says yes (new personal data, POPIA). Off, the giver's door says the app is coming soon instead.
   */
  launchListOpen: false,
  /**
   * "Request a charity" on Find a charity and in the app (src/lib/charity-requests.ts). Off until migration
   * 20261115000001_charity_requests.sql is on the database and Yehuda says yes (new personal data, POPIA). Off, the
   * links don't show and the page says requests aren't open yet. CHARITY_REQUESTS=yes on the server also opens it,
   * for the test site, without a code change.
   */
  charityRequestsOpen: false,
};

/** Whether "Request a charity" is open: the switch above, or CHARITY_REQUESTS=yes on the server. */
export function charityRequestsOpen(env: Record<string, string | undefined> = process.env): boolean {
  return appLinks.charityRequestsOpen || env.CHARITY_REQUESTS === "yes";
}
