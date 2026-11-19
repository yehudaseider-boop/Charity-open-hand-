/**
 * Which buttons the payment return page shows. A gift started in the phone app is paid in the app's sheet, so
 * the page offers only the way back: the app's own screen handles trying again, and a retry started from the
 * website's page would be a second gift the app doesn't know about. Website donors keep their normal retry.
 * No imports, so it is easy to test.
 */

export type ReturnStatus = "paid" | "failed" | "pending";

/**
 * Whether the gift came from the app: the gift's own saved source first (the server wrote it), the address's
 * `from=app` mark as an extra hint. A missing hint never counts as the app.
 */
export function cameFromApp(args: { cameFrom?: string | null; fromParam?: boolean }): boolean {
  return args.cameFrom === "app" || args.fromParam === true;
}

export function returnActions(args: { cameFrom?: string | null; fromParam?: boolean; status: ReturnStatus }): { backToApp: boolean; tryAgain: boolean } {
  const app = cameFromApp(args);
  return { backToApp: app, tryAgain: !app && args.status !== "paid" };
}
