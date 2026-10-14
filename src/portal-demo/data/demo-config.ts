/**
 * Settings that exist ONLY for the charity portal demo. Nothing here is a real rate,
 * schedule or decision: each value is a placeholder so the screens have something to show.
 * Real values come from `src/config/platform.ts` and the payment provider once they are set.
 */

/** The demo's "today" (Johannesburg calendar day). Fixed so the demo data never drifts. */
export const DEMO_TODAY = "2026-10-14";

/** The demo holds 18 months up to DEMO_TODAY: the last 12 for the screens, plus earlier history so returning donors exist. */
export const DEMO_START = "2025-04-15";

/**
 * PLACEHOLDER processing fee, in parts per million of each donation. 30 000 ppm = 3%.
 * NOT a real gateway rate: the real rate is empty until Yehuda supplies it, and who pays
 * it (donor, Givezy or the charity) is still an open decision (docs/go-live-checklist.md).
 */
export const DEMO_PLACEHOLDER_FEE_PPM = 30_000;

/** Givezy charges no platform fee (decided 08/10/2026). */
export const PLATFORM_FEE_CENTS = 0;

/**
 * Who the processing fee is deducted from, in the demo. "charity" shows the full fee
 * design (gross, fee, net). "not_charity" shows the split model where the charity receives
 * exactly the donation. A demo switch on the Finances page flips it.
 */
export type FeeModel = "charity" | "not_charity";

/**
 * PLACEHOLDER payout schedule: settlement one business day after the donation, then one
 * weekly payout (settlements Monday to Sunday, sent the next Monday, in the bank by Thursday).
 * The payment provider's real schedule replaces this.
 */
export const DEMO_PAYOUT_SCHEDULE = "Weekly (demo placeholder): settled Monday to Sunday, sent the next Monday, in your bank by Thursday";
