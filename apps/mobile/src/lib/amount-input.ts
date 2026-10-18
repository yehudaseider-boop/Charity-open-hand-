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
