import { parseRandToCents } from "@shared/money";

export type AmountCheck =
  | { ok: true; cents: number }
  | { ok: false; reason: "empty" | "invalid" | "below_minimum" };

/** Check a typed gift amount against the minimum (from fee config). */
export function checkAmount(input: string, minCents: number): AmountCheck {
  if (input.trim() === "") return { ok: false, reason: "empty" };
  const cents = parseRandToCents(input);
  if (cents === null || cents <= 0) return { ok: false, reason: "invalid" };
  if (cents < minCents) return { ok: false, reason: "below_minimum" };
  return { ok: true, cents };
}
