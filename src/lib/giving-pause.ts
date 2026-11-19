/**
 * The pause switch (19/11/2026): `GIVING_PAUSED=yes` in Vercel stops new gifts everywhere at once (the website, the
 * phone app, "Update my card"), while the rest of the site keeps working and payment confirmations still arrive.
 * Monthly collections wait too (the daily job already waits when a charity can't take gifts, and counts nothing as
 * failed); they are collected on the first day after it is switched off. Off unless exactly "yes".
 * Where to switch it: `docs/incident-plan.md`. Kept dependency-free (the app's messages use the same words).
 */
export const givingPaused = (env: Record<string, string | undefined> = process.env): boolean => env.GIVING_PAUSED === "yes";

/** What a donor is told: plain, what did and didn't happen, nothing to retype. */
export const GIVING_PAUSED_MESSAGE = "Giving is paused for a short while. Nothing has been charged. Please try again later.";
