/**
 * Where to get the phone app, and when Givezy launches (10/11/2026). Store links stay null until Yehuda confirms
 * them: the landing page then says the app is coming soon, never a dead link. The launch month was confirmed by
 * Yehuda on 10/11/2026; null hides the line. Never guess these.
 */
export const appLinks: { appStoreUrl: string | null; playStoreUrl: string | null; launchMonth: string | null; launchListOpen: boolean } = {
  appStoreUrl: null,
  playStoreUrl: null,
  /** Shown as written on the landing page: "Launching in South Africa, January 2027." */
  launchMonth: "January 2027",
  /**
   * "Notify me at launch" (src/lib/launch-list.ts). Off until migration 20261110000012_launch_list.sql is on the
   * database and Yehuda says yes (new personal data, POPIA). Off, the giver's door says the app is coming soon instead.
   */
  launchListOpen: false,
};
