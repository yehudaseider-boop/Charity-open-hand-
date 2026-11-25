import { COMMA_THOUSANDS_MESSAGE, parseRandToCents, usesCommaThousands } from "@shared/money";

/** Longest Rand amount a box takes ("99999999.99"): stops a stray long number breaking the layout. */
export const AMOUNT_MAX_LENGTH = 11;

/**
 * The same words for a bad amount in every box in the app (give, goals, income, given elsewhere):
 * null when it reads as more than R0.
 */
export function amountProblem(input: string, example: string): string | null {
  const cents = parseRandToCents(input);
  if (cents !== null && cents > 0) return null;
  if (usesCommaThousands(input)) return COMMA_THOUSANDS_MESSAGE;
  return `Enter an amount in Rand, for example ${example}`;
}

/**
 * An amount as the box shows it once the donor moves on (25/11/2026): Rand thousands with a space and cents only when
 * there are some ("1 234.50", "180"), the way amounts are written everywhere else. Left as typed (null) when the
 * spaced form would not fit the box.
 */
export function groupedAmountInput(cents: number): string | null {
  const c = cents % 100;
  const whole = String((cents - c) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const text = c ? `${whole}.${String(c).padStart(2, "0")}` : whole;
  return text.length <= AMOUNT_MAX_LENGTH ? text : null;
}
