/**
 * Keeping donors (CRM build step 16, 10/11/2026): for a chosen tax year, how many of last tax year's donors gave
 * again, who gave last year but not this one ("last year but not this"), who gave in an earlier year but not since
 * ("some year but not since"), and who gave more or less than last year. Pure helpers; the rows come from the
 * database function `charity_keeping_donors`, which counts paid gifts only (refunds and charge-backs don't count;
 * gifts the charity recorded itself do, as everywhere else on the dashboard).
 * No sector figures or averages from elsewhere: only this charity's own numbers.
 */
import { formatDate, taxYearLabel, taxYearName, taxYearRange } from "@/lib/dates";
import { csvPhone, centsToPlain } from "@/lib/csv";
import { ERASED_DONOR, shownEmail, thisTaxYear } from "./dashboard";

/** Johannesburg midnight. South Africa has no daylight saving, so it is always +02:00. */
const saMidnight = (isoDate: string) => `${isoDate}T00:00:00+02:00`;

export const keepingYears = [
  { key: "this", label: "This tax year" },
  { key: "last", label: "Last tax year" },
] as const;
export type KeepingYearKey = (typeof keepingYears)[number]["key"];

export function keepingYearKey(value: unknown): KeepingYearKey {
  return keepingYears.find((y) => y.key === value)?.key ?? "this";
}

export type KeepingWindow = {
  key: KeepingYearKey;
  /** The chosen tax year, named by the year it ends (2027 is 1 March 2026 to 28 February 2027). */
  taxYear: number;
  /** Start of the year before the chosen one (included). */
  lastFrom: string;
  /** Start of the chosen year (included); end of the year before (not included). */
  thisFrom: string;
  /** End of the chosen year (not included). */
  thisTo: string;
  /** The moment of asking: a gift after the chosen year, up to now, means the donor came back ("not since" is false). */
  now: string;
  /** Whether the chosen year is still running, so its totals are "so far". */
  running: boolean;
  /** "the 2027 tax year (01/03/2026 to 28/02/2027)" */
  words: string;
  /** "2026/27", "2025/26": short names for the two years being compared. */
  thisName: string;
  lastName: string;
};

/** The chosen tax year and the one before it, as Johannesburg-midnight timestamps for the database. */
export function keepingWindow(key: KeepingYearKey, now: Date): KeepingWindow {
  const current = thisTaxYear(now).taxYear;
  const taxYear = key === "last" ? current - 1 : current;
  const range = (y: number) => taxYearRange(y);
  const nextStart = range(taxYear + 1).start;
  return {
    key,
    taxYear,
    lastFrom: saMidnight(range(taxYear - 1).start),
    thisFrom: saMidnight(range(taxYear).start),
    thisTo: saMidnight(nextStart),
    now: now.toISOString(),
    running: taxYear === current,
    words: `the ${taxYearLabel(taxYear)}`,
    thisName: taxYearName(taxYear),
    lastName: taxYearName(taxYear - 1),
  };
}

/** One donor, as `charity_keeping_donors` returns it. An erased donor has the amounts only. */
export type KeepingRow = {
  donor_id: string | null;
  this_cents: number;
  last_cents: number;
  earlier_cents: number;
  /** Given after the chosen tax year, up to now (only when looking at a past year). */
  after_cents: number;
  last_paid_at: string | null;
  recorded_only: boolean;
  erased: boolean;
  donor_type: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
};

/** The database answers bigints as text; make every amount a whole number of cents. */
export function toKeepingRow(r: Record<string, unknown>): KeepingRow {
  const cents = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  };
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    donor_id: text(r.donor_id),
    this_cents: cents(r.this_cents),
    last_cents: cents(r.last_cents),
    earlier_cents: cents(r.earlier_cents),
    after_cents: cents(r.after_cents),
    last_paid_at: text(r.last_paid_at),
    recorded_only: r.recorded_only === true,
    erased: r.erased === true,
    donor_type: text(r.donor_type),
    display_name: text(r.display_name),
    email: text(r.email),
    phone: text(r.phone),
  };
}

export type KeepingList = "lybunt" | "sybunt" | "more" | "less";

export const keepingLists: { key: KeepingList; label: string; empty: string }[] = [
  { key: "lybunt", label: "Gave last tax year, not since", empty: "Everyone who gave last tax year has given again." },
  { key: "sybunt", label: "Gave in an earlier year, not since", empty: "Nobody from an earlier year is missing." },
  { key: "more", label: "Gave more than last year", empty: "Nobody has given more than last tax year." },
  { key: "less", label: "Gave less than last year", empty: "Nobody has given less than last tax year." },
];

export function keepingListKey(value: unknown): KeepingList {
  return keepingLists.find((l) => l.key === value)?.key ?? "lybunt";
}

type Amounts = Pick<KeepingRow, "this_cents" | "last_cents" | "earlier_cents"> & Partial<Pick<KeepingRow, "after_cents">>;

/**
 * Which list a row belongs to. "Not since" means no paid gift from the start of the chosen year up to now, so a
 * donor who came back after a past chosen year is in neither of the first two lists. The same rules are in
 * charity_keeping_summary (migration 20261110000008); change both together.
 */
export function inList(r: Amounts, list: KeepingList): boolean {
  const since = r.this_cents + (r.after_cents ?? 0);
  switch (list) {
    case "lybunt":
      return r.last_cents > 0 && since === 0;
    case "sybunt":
      return r.earlier_cents > 0 && r.last_cents === 0 && since === 0;
    case "more":
      return r.last_cents > 0 && r.this_cents > r.last_cents;
    case "less":
      return r.last_cents > 0 && r.this_cents > 0 && r.this_cents < r.last_cents;
  }
}

export type KeepingSummary = {
  /** Donors who gave last tax year. */
  lastYearDonors: number;
  /** Of those, how many gave again in the chosen year. */
  gaveAgain: number;
  /** Whole-number percentage, or null when nobody gave last year. */
  percent: number | null;
  counts: Record<KeepingList, number>;
  /** What last year's donors who haven't given again gave last year, in cents. */
  lybuntLastYearCents: number;
};

/** A whole-number percentage, rounded half up, from counts only. Null when there is nothing to divide by. */
export function wholePercent(part: number, of: number): number | null {
  if (!Number.isFinite(of) || of <= 0) return null;
  const p = Math.max(0, Math.min(part, of));
  return Math.floor((p * 100 + Math.floor(of / 2)) / of);
}

export function keepingSummary(rows: Amounts[]): KeepingSummary {
  let lastYearDonors = 0, gaveAgain = 0, lybuntLastYearCents = 0;
  const counts: Record<KeepingList, number> = { lybunt: 0, sybunt: 0, more: 0, less: 0 };
  for (const r of rows) {
    if (r.last_cents > 0) {
      lastYearDonors += 1;
      if (r.this_cents > 0) gaveAgain += 1;
    }
    if (inList(r, "lybunt")) lybuntLastYearCents += r.last_cents;
    for (const l of keepingLists) if (inList(r, l.key)) counts[l.key] += 1;
  }
  return { lastYearDonors, gaveAgain, percent: wholePercent(gaveAgain, lastYearDonors), counts, lybuntLastYearCents };
}

/** One row from charity_keeping_summary, as a summary. Bigints come back as text. */
export function toKeepingSummary(r: Record<string, unknown> | null | undefined): KeepingSummary {
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) && x > 0 ? Math.trunc(x) : 0;
  };
  const lastYearDonors = n(r?.last_year_donors);
  const gaveAgain = Math.min(n(r?.gave_again), lastYearDonors);
  return {
    lastYearDonors,
    gaveAgain,
    percent: wholePercent(gaveAgain, lastYearDonors),
    counts: { lybunt: n(r?.lybunt), sybunt: n(r?.sybunt), more: n(r?.gave_more), less: n(r?.gave_less) },
    lybuntLastYearCents: n(r?.lybunt_last_cents),
  };
}

/** The retention line, in plain words, with the counts it comes from. */
export function retentionSentence(s: KeepingSummary, w: Pick<KeepingWindow, "running" | "lastName">): string {
  if (s.lastYearDonors === 0) return `Nobody gave in the ${w.lastName} tax year, so there's nobody to compare yet.`;
  const verb = w.running ? "have given again so far" : "gave again";
  return `${s.percent}% of last tax year's donors ${verb} (${s.gaveAgain} of ${s.lastYearDonors}).`;
}

/** What the charity may see of one row. An erased donor shows no name, contact, date or link, whatever the row holds. */
export function keepingDetails(r: KeepingRow): { name: string; email: string | null; phone: string | null; lastPaidAt: string | null; donorId: string | null } {
  const email = shownEmail(r.email);
  if (r.erased || (r.email && !email)) return { name: ERASED_DONOR, email: null, phone: null, lastPaidAt: null, donorId: null };
  return { name: r.display_name?.trim() || "Donor", email, phone: r.phone?.trim() || null, lastPaidAt: r.last_paid_at, donorId: r.donor_id };
}

/** Rows for one list, in the order that helps most: biggest amounts first, then the most recent gift. */
export function keepingListRows(rows: KeepingRow[], list: KeepingList): KeepingRow[] {
  const key = (r: KeepingRow) => (list === "sybunt" ? r.earlier_cents : list === "more" || list === "less" ? Math.abs(r.this_cents - r.last_cents) : r.last_cents);
  return rows
    .filter((r) => inList(r, list))
    .sort((a, b) => key(b) - key(a) || (b.last_paid_at ?? "").localeCompare(a.last_paid_at ?? "") || (a.donor_id ?? "").localeCompare(b.donor_id ?? ""));
}

export const KEEPING_CSV_HEADER = ["Donor", "Email", "Phone", "Last donation", "Chosen tax year (R)", "Tax year before (R)", "Earlier years (R)", "Since the chosen year (R)", "Only gifts you recorded"];

export function keepingCsvRows(rows: KeepingRow[], list: KeepingList): (string | null)[][] {
  return keepingListRows(rows, list).map((r) => {
    const d = keepingDetails(r);
    return [d.name, d.email, csvPhone(d.phone), d.lastPaidAt ? formatDate(d.lastPaidAt) : "", centsToPlain(r.this_cents), centsToPlain(r.last_cents), centsToPlain(r.earlier_cents), centsToPlain(r.after_cents), r.recorded_only ? "Yes" : "No"];
  });
}
