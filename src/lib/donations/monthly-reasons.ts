/**
 * Why a monthly donation stopped, as written to `recurring_donations.ended_reason`. The server writes these and
 * the website and the phone app read them to decide what to offer, so they live here, with no imports (the app
 * shares this file).
 */
export const DECLINED_REASON = "the card was declined every time we tried this month";
export const NEW_CARD_NOT_REUSABLE = "the new card can't be used for monthly payments";
