/**
 * Where to get the phone app, and when Givezy launches (10/11/2026). Store links stay null until Yehuda confirms
 * them: the home page then says the app is coming soon and offers giving on the website, never a dead link. The
 * launch month was confirmed by Yehuda on 10/11/2026; null hides the line. Never guess these.
 */
export const appLinks: { appStoreUrl: string | null; playStoreUrl: string | null; launchMonth: string | null } = {
  appStoreUrl: null,
  playStoreUrl: null,
  /** Shown as written on the home page: "Launching in South Africa, January 2027." */
  launchMonth: "January 2027",
};
