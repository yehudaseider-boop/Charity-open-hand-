/**
 * The optional contribution to Givezy on the give form (Yehuda, 09/11/2026): amount buttons (the presets in
 * `platformConfig.contributionPresetsCents`), "Other" for an amount the donor types, and "No thanks" for R0.
 * The website and the phone app both use this file, so it is kept free of other packages: the presets and the
 * default come in as arguments (from the config on the website, from the server's ready reply in the app).
 */
import { COMMA_THOUSANDS_MESSAGE, formatRand, parseRandToCents, usesCommaThousands } from "../money";

/** A preset amount in cents, an amount the donor types ("other"), or no contribution ("none"). */
export type ContributionChoice = number | "other" | "none";

/** The one line under the heading, the same on the website and in the app. */
// "Givezy takes nothing from your gift" (13/11/2026, Yehuda: yes): Givezy is paid by the charity's monthly fee, never
// out of a gift. Website and app.
export const CONTRIBUTION_EXPLAINER = "Givezy takes nothing from your gift. A contribution helps keep Givezy running and is separate from it.";

/** What the form shows after "No thanks", with the way back to an amount. */
export const NO_CONTRIBUTION_NOTE = "No contribution this time. Choose an amount above to add one.";
/** The same note when there are no amount buttons (an app talking to an older server): only Other is there. */
export const NO_CONTRIBUTION_NOTE_OTHER_ONLY = "No contribution this time. Choose Other above to add one.";

/** The choice the form starts with: the default when it is one of the presets, otherwise "No thanks" (never a made-up amount). */
export function startingChoice(presetsCents: readonly number[], defaultCents: number): ContributionChoice {
  return defaultCents > 0 && presetsCents.includes(defaultCents) ? defaultCents : "none";
}

/** "R20", or "R20 a month" when the gift is monthly (the contribution repeats with it). */
export function contributionLabel(cents: number, monthly: boolean): string {
  return `${formatRand(cents)}${monthly ? " a month" : ""}`;
}

/**
 * The contribution in cents for a choice, or what to fix in plain words. Zero is always allowed ("No thanks",
 * or 0 typed under Other); anything else under the minimum is refused, as the server refuses it.
 */
export function contributionCents(
  choice: ContributionChoice,
  otherText: string,
  minCents: number,
): { ok: true; cents: number } | { ok: false; message: string } {
  if (choice === "none") return { ok: true, cents: 0 };
  if (typeof choice === "number") return { ok: true, cents: choice };
  const typed = otherText.trim();
  if (!typed) return { ok: false, message: "Enter your contribution in Rand, for example 15, or choose No thanks." };
  if (usesCommaThousands(typed)) return { ok: false, message: `${COMMA_THOUSANDS_MESSAGE}.` };
  const cents = parseRandToCents(typed);
  if (cents === null) return { ok: false, message: "Enter your contribution in Rand, for example 15 or 15.50, or choose No thanks." };
  if (cents > 0 && cents < minCents) return { ok: false, message: `The minimum contribution to Givezy is ${formatRand(minCents)}. Choose a bigger amount, or No thanks.` };
  return { ok: true, cents };
}
