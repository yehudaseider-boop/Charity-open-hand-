/**
 * Monthly donors who stopped (CRM build step 4): the periods a charity can choose, the plain words for
 * why a monthly donation ended, the totals and the CSV rows. Pure helpers; the rows come from the
 * database function `charity_lapsed_monthly`, which holds the one meaning of "stopped".
 */
import { taxYearLabel, taxYearRange, formatDate } from "@/lib/dates";
import { csvPhone, centsToPlain } from "@/lib/csv";
import { ERASED_DONOR, shownEmail, thisTaxYear, type Period } from "./dashboard";
import { RECENT_DAYS } from "./insights";

export const lapsedPeriods = [
  { key: "tax-year", label: "This tax year" },
  { key: "last-tax-year", label: "Last tax year" },
  { key: "30-days", label: `Last ${RECENT_DAYS} days` },
] as const;
export type LapsedPeriodKey = (typeof lapsedPeriods)[number]["key"];

/** The period asked for in the address, or this tax year when it is missing or not one of ours. */
export function lapsedPeriodKey(value: unknown): LapsedPeriodKey {
  return lapsedPeriods.find((p) => p.key === value)?.key ?? "tax-year";
}

/** South Africa has no daylight saving, so Johannesburg midnight is always +02:00. */
const saMidnight = (isoDate: string) => `${isoDate}T00:00:00+02:00`;

/**
 * The chosen period as timestamps for the database (from: included, to: not included), and how to say it.
 * Tax years run from 1 March to the end of February, Johannesburg time. The last 30 days is the same
 * rolling window the overview's "Needs you this week" uses.
 */
export function lapsedPeriod(key: LapsedPeriodKey, now: Date): Period & { key: LapsedPeriodKey; words: string } {
  if (key === "30-days") {
    return { key, from: new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString(), to: now.toISOString(), words: `the last ${RECENT_DAYS} days` };
  }
  const current = thisTaxYear(now);
  if (key === "tax-year") return { key, from: current.from, to: current.to, words: `the ${taxYearLabel(current.taxYear)}` };
  const last = current.taxYear - 1;
  return { key, from: saMidnight(taxYearRange(last).start), to: current.from, words: `the ${taxYearLabel(last)}` };
}

export type LapsedReason = "cancelled" | "declined" | "dispute" | "erased" | "other";

/** One stopped monthly donor, as `charity_lapsed_monthly` returns it. An erased donor has the amount and end date only. */
export type LapsedRow = {
  recurring_id: string;
  /** Null when there is no donor page to open (an erased donor, or no paid donation left). */
  donor_id: string | null;
  amount_cents: number;
  ended_at: string;
  last_paid_at: string | null;
  reason: LapsedReason;
  donor_type: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
};

/** Why it ended, in plain words. */
export const lapsedReasonLabel: Record<LapsedReason, string> = {
  cancelled: "The donor cancelled it",
  declined: "The card kept failing",
  dispute: "A payment was disputed with the bank",
  erased: "A donor who erased their information",
  other: "It ended (no reason recorded)",
};

export function lapsedReason(value: unknown): LapsedReason {
  return typeof value === "string" && Object.hasOwn(lapsedReasonLabel, value) ? (value as LapsedReason) : "other";
}

/**
 * What the charity may see of one row. An erased donor shows no name, contact details, last gift or
 * link, whatever the row holds: the database already leaves them out, and this is the second lock.
 */
export function lapsedDetails(r: LapsedRow): { name: string; email: string | null; phone: string | null; lastPaidAt: string | null; donorId: string | null } {
  const email = shownEmail(r.email);
  if (r.reason === "erased" || (r.email && !email)) return { name: ERASED_DONOR, email: null, phone: null, lastPaidAt: null, donorId: null };
  return { name: r.display_name?.trim() || "Donor", email, phone: r.phone?.trim() || null, lastPaidAt: r.last_paid_at, donorId: r.donor_id };
}

/** How many stopped, and the Rand a month that stopped with them. Whole cents only. */
export function lapsedSummary(rows: Pick<LapsedRow, "amount_cents">[]): { count: number; centsPerMonth: number } {
  return { count: rows.length, centsPerMonth: rows.reduce((t, r) => t + Number(r.amount_cents), 0) };
}

/** Newest first; the database sorts this way too. */
export function sortLapsed<T extends Pick<LapsedRow, "ended_at" | "recurring_id">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime() || a.recurring_id.localeCompare(b.recurring_id));
}

export const LAPSED_CSV_HEADER = ["Donor", "Email", "Phone", "Monthly amount (R)", "Last donation", "Ended on", "Why it ended"];

/** Rows for the download. `toCsv` makes every cell safe for a spreadsheet. */
export function lapsedCsvRows(rows: LapsedRow[]): (string | null)[][] {
  return sortLapsed(rows).map((r) => {
    const d = lapsedDetails(r);
    return [d.name, d.email, csvPhone(d.phone), centsToPlain(r.amount_cents), d.lastPaidAt ? formatDate(d.lastPaidAt) : "", formatDate(r.ended_at), lapsedReasonLabel[r.reason]];
  });
}
