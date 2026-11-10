/**
 * The "Try it" giving demo in the landing page's "I give" door (Yehuda, 10/11/2026). Pick an amount, once or every
 * month, and a sample cause, and see what it comes to and what an s18A receipt would show. Nothing is charged, stored
 * or sent anywhere. Integer cents only; the tax year comes from the platform config (src/lib/dates.ts). Pure.
 */
import { platformConfig } from "@/config/platform";
import { formatRand, parseRandToCents } from "@/lib/money";
import { taxYearFor, taxYearName, zonedParts } from "@/lib/dates";

/** The amount buttons, in cents (R50, R100, R250), then "Other". */
export const DEMO_PRESETS_CENTS = [5_000, 10_000, 25_000] as const;
/** The most the demo shows: R1 000 000. */
export const DEMO_MAX_CENTS = 100_000_000;

/** Sample causes only: no real charity names, and nothing said about what a gift does. */
export const DEMO_CAUSES = [
  { id: "food", label: "Feeding families" },
  { id: "learning", label: "Schools and learning" },
  { id: "care", label: "Care for older people" },
] as const;
export type DemoCause = (typeof DEMO_CAUSES)[number]["id"];
export type DemoFrequency = "once" | "monthly";

export type DemoInput = {
  /** A preset in cents, or "other" with what was typed, or nothing picked yet. */
  amount: { kind: "preset"; cents: number } | { kind: "other"; typed: string } | null;
  frequency: DemoFrequency;
  cause: DemoCause | null;
  now: Date;
};

export type DemoResult =
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      cents: number;
      frequency: DemoFrequency;
      cause: string;
      /** Gifts from this month to the end of this tax year (1 for a once-off gift). */
      giftsThisTaxYear: number;
      /** What the s18A receipt for this tax year would show. */
      receiptCents: number;
      /** Twelve monthly gifts (monthly only). */
      perYearCents: number | null;
      taxYear: number;
      taxYearName: string;
      /** The tax year's last month, e.g. "February". */
      lastMonth: string;
      /** The sentence read out to screen readers. */
      summary: string;
    };

/** How many monthly gifts fall from this month (Johannesburg) to the end of its tax year: March gives 12, February 1. */
export function monthsLeftInTaxYear(now: Date): number {
  const { month } = zonedParts(now);
  const start = platformConfig.taxYear.startMonth;
  return ((start - 1 - month + 12) % 12) + 1;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The tax year's last month by name: the month before it starts. */
export function taxYearLastMonth(): string {
  return MONTHS[(platformConfig.taxYear.startMonth + 10) % 12];
}

/** Reads the demo's choices and works out the sample summary. */
export function demoSummary(input: DemoInput): DemoResult {
  if (!input.amount) return { kind: "empty", message: "Pick an amount to see what it comes to." };
  let cents: number;
  if (input.amount.kind === "preset") {
    cents = input.amount.cents;
  } else {
    const typed = input.amount.typed.trim();
    if (!typed) return { kind: "empty", message: "Type an amount in Rand." };
    const parsed = parseRandToCents(typed);
    if (parsed === null) return { kind: "error", message: "Enter an amount in Rand, for example 180 or 180.50." };
    cents = parsed;
  }
  if (cents < platformConfig.minDonationCents) return { kind: "error", message: `The smallest gift is ${formatRand(platformConfig.minDonationCents)}.` };
  if (cents > DEMO_MAX_CENTS) return { kind: "error", message: `The demo shows gifts up to ${formatRand(DEMO_MAX_CENTS)}.` };
  if (!input.cause) return { kind: "empty", message: "Pick a cause to finish the sample." };

  const cause = DEMO_CAUSES.find((c) => c.id === input.cause)?.label ?? "";
  const taxYear = taxYearFor(input.now);
  const name = taxYearName(taxYear);
  const gifts = input.frequency === "monthly" ? monthsLeftInTaxYear(input.now) : 1;
  const receiptCents = cents * gifts;
  const perYearCents = input.frequency === "monthly" ? cents * 12 : null;
  const summary =
    input.frequency === "monthly"
      ? `${formatRand(cents)} every month to a sample charity for ${cause.toLowerCase()}: ${formatRand(perYearCents ?? 0)} a year. Starting this month, your s18A receipt for the ${name} tax year would show ${formatRand(receiptCents)}.`
      : `${formatRand(cents)} once to a sample charity for ${cause.toLowerCase()}. Your s18A receipt for the ${name} tax year would show ${formatRand(receiptCents)}.`;
  return { kind: "ready", cents, frequency: input.frequency, cause, giftsThisTaxYear: gifts, receiptCents, perYearCents, taxYear, taxYearName: name, lastMonth: taxYearLastMonth(), summary };
}
