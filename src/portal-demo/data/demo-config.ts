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

/**
 * DESIGN PLACEHOLDERS for the "Needs attention" and follow-up screens. These are starting
 * points for discussion, not decisions: change them here and every screen follows.
 */
/** A donor counts as "new to welcome" for this many days after their first donation. */
export const FOLLOW_UP_NEW_DAYS = 14;
/** Large donations are offered for a personal thank-you for this many days. */
export const FOLLOW_UP_LARGE_DAYS = 30;
/** A campaign is "ahead" at or above this percentage of where an even pace would put it. */
export const PACE_AHEAD_PERCENT = 110;
/** ... "on track" at or above this percentage, otherwise "behind". */
export const PACE_ON_TRACK_PERCENT = 90;
/** A campaign ending within this many days is flagged. */
export const CAMPAIGN_ENDING_SOON_DAYS = 14;
/** Large-donation threshold used until a charity sets its own under Notifications (R5 000, in cents). */
export const DEFAULT_LARGE_DONATION_CENTS = 500_000;

/**
 * DESIGN PLACEHOLDERS for donor giving groups (modelled on the groups Givelify describes:
 * Consistent, Occasional, New, Decreasing, Inactive). Plain rules, not AI, so a charity can see why.
 * Giving is counted in 30-day windows: the last six (about six months) and the six before.
 */
/** A donor is "New" for this many days after their first donation (Givelify describes four weeks). */
export const GROUP_NEW_DAYS = 28;
/** Length of one window, in days. */
export const GROUP_WINDOW_DAYS = 30;
/** Windows looked at, each side. */
export const GROUP_WINDOWS = 6;
/** "Consistent" means a donation in at least this many of the windows. */
export const GROUP_CONSISTENT_MIN = 5;
