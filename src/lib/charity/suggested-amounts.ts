/**
 * The charity's own suggested amounts for the give screens (16/10/2026, Yehuda: "let the charity
 * choose"). Givezy never suggests a figure of its own: with none set, a new donor types the amount.
 * Pure, so the app can share the ordering rule.
 */
import { parseRandToCents } from "../money";

export const MAX_SUGGESTED = 3;

export type SuggestedResult = { ok: true; cents: number[] } | { ok: false; fieldErrors: Record<string, string> };

/** Up to three amounts typed in Rand (blank boxes are skipped), each at least the minimum, no repeats, smallest first. */
export function parseSuggestedAmounts(typed: (string | null | undefined)[], minCents: number, minLabel: string): SuggestedResult {
  const fieldErrors: Record<string, string> = {};
  const cents: number[] = [];
  typed.slice(0, MAX_SUGGESTED).forEach((raw, i) => {
    const text = (raw ?? "").trim();
    if (!text) return;
    const key = `suggested_${i + 1}`;
    const c = parseRandToCents(text);
    if (c === null) fieldErrors[key] = "Enter an amount in Rand, for example 180";
    else if (c < minCents) fieldErrors[key] = `The smallest donation is ${minLabel}`;
    else if (c > 100_000_000) fieldErrors[key] = "Suggested amounts can be up to R1 000 000";
    else if (cents.includes(c)) fieldErrors[key] = "You already have this amount";
    else cents.push(c);
  });
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, cents: cents.sort((a, b) => a - b) };
}

/**
 * The amounts a donor can tap: their own recent amounts first (the last one here leads), then the
 * charity's suggestions, at most three, no repeats. Either list can be empty.
 */
export function tapAmounts(own: number[], charity: number[], max = MAX_SUGGESTED): number[] {
  const out: number[] = [];
  for (const c of [...own, ...charity]) {
    if (c > 0 && !out.includes(c)) out.push(c);
    if (out.length === max) break;
  }
  return out;
}
