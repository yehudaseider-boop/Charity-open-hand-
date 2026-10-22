/**
 * Giving from inside the app. The app never sees a card number or builds a payment form:
 * the donor enters the amount and pays on our own secure payment page, shown in the phone's
 * in-app browser sheet. When they finish, that page sends them back to the app.
 *
 * This file has no imports on purpose: the website's tests run it too.
 */

/** Where the payment page sends the donor back to (the app's own link; the website uses the same). */
export const APP_RETURN_LINK = "nedivlev://giving";

/**
 * The in-app payment sheet is a switch, off unless EXPO_PUBLIC_IN_APP_GIVING is "yes" when the
 * app is built or published. Off, "Give" opens the phone's browser instead. Keep it off in builds
 * sent to the app stores until the stores' rules for donations inside apps have been checked.
 */
export const inAppGivingEnabled = (value: string | undefined): boolean => value === "yes";
export const IN_APP_GIVING = inAppGivingEnabled(process.env.EXPO_PUBLIC_IN_APP_GIVING);

/**
 * Saving a card for once-off gifts is a second switch, off unless EXPO_PUBLIC_SAVED_CARDS is "yes" (and the
 * server's SAVED_CARDS too). Keep it off in builds sent to the app stores until the consent wording and the
 * stores' answers are in (see docs/go-live-checklist.md).
 */
export const SAVED_CARDS = inAppGivingEnabled(process.env.EXPO_PUBLIC_SAVED_CARDS);

export type BrowserOutcome = { type: string };
export type OpenInAppBrowser = (url: string, returnTo: string) => Promise<BrowserOutcome>;

/**
 * Show the payment page. Resolves when the donor comes back (finished or closed the sheet);
 * rejects if the sheet could not open. A refusal to open a non-https address is built in.
 */
export async function openGivingPage(url: string, open: OpenInAppBrowser): Promise<"returned" | "closed"> {
  if (!url.startsWith("https://")) throw new Error("The payment page must be on a secure address");
  sheetOpen = true;
  try {
    const result = await open(url, APP_RETURN_LINK);
    return result.type === "success" ? "returned" : "closed";
  } finally {
    sheetOpen = false;
  }
}

/** True while the payment sheet is open (set and cleared by openGivingPage). */
let sheetOpen = false;

/**
 * On Android the payment page's return link (nedivlev://giving) also reaches the app's router, which would
 * jump to the Giving tab and close the give screen while it is still checking the payment: the donor would
 * never see "nothing was charged" or the thank-you. While the sheet is open, that link is the sheet's own
 * and the router must ignore it (src/app/+native-intent.tsx). Opened any other time, it goes to Giving as usual.
 */
export function isSheetReturn(path: string, initial: boolean): boolean {
  return sheetOpen && !initial && /^(nedivlev:\/\/)?\/?giving\/?(\?.*)?$/.test(path);
}

/** The payment is confirmed by the gateway a moment after the donor returns: look a few times. */
export const REFRESH_AFTER_GIVING_MS = [0, 5_000, 15_000, 30_000];

/** Reload the donor's giving at each delay (counted from the start), so a new gift and the thank-you appear without a manual refresh. */
export async function refreshAfterGiving(
  refresh: () => Promise<void>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  delays: number[] = REFRESH_AFTER_GIVING_MS,
): Promise<void> {
  let waited = 0;
  for (const at of delays) {
    if (at > waited) await wait(at - waited);
    waited = at;
    try {
      await refresh();
    } catch {
      // A failed look is tried again at the next delay.
    }
  }
}
