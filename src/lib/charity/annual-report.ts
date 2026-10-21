/**
 * A charity's annual report for one SARS tax year (18/10/2026, Yehuda): what a board or AGM asks for,
 * filled from Givezy's own records. Pure: the caller loads the rows. Money in integer cents.
 */
import { platformConfig } from "@/config/platform";
import { taxYearFor, taxYearRange } from "@/lib/dates";
import { averageCents, saDate } from "./dashboard";

export type ReportGift = {
  id: string;
  donor_id: string;
  status: string;
  amount_cents: number;
  paid_at: string | null;
  tax_year: number | null;
  recurring_id: string | null;
  campaign_id: string | null;
  wants_18a: boolean;
};

export type MonthLine = { month: string; label: string; cents: number; count: number };
export type CampaignLine = { id: string; title: string; cents: number; count: number };

export type AnnualReport = {
  taxYear: number;
  /** The year is still running: figures are "so far". */
  running: boolean;
  start: string;
  end: string;
  /** Paid donations that stayed paid (refunds and chargebacks are counted apart). */
  totalCents: number;
  donationCount: number;
  donors: number;
  /** First ever paid donation to this charity fell in this tax year. */
  newDonors: number;
  returningDonors: number;
  monthlyCents: number;
  onceOffCents: number;
  averageCents: number;
  months: MonthLine[];
  bestMonth: MonthLine | null;
  campaigns: CampaignLine[];
  refunded: { count: number; cents: number };
  /** Donors who asked for an s18A receipt, and how many of them have one for every such gift. */
  s18a: { donors: number; receipted: number; waitingCents: number };
};

const yearOf = (g: ReportGift) => g.tax_year ?? (g.paid_at ? taxYearFor(g.paid_at) : null);

/** Tax years with any paid (or later refunded) donation, newest first, always including the current one. */
export function reportYears(gifts: Pick<ReportGift, "tax_year" | "paid_at">[], now: Date): number[] {
  const years = new Set<number>([taxYearFor(now)]);
  for (const g of gifts) {
    const y = g.tax_year ?? (g.paid_at ? taxYearFor(g.paid_at) : null);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** The twelve months of a tax year, March to February: "2026-03" with "Mar 2026". */
export function taxYearMonths(taxYear: number): { month: string; label: string }[] {
  const startMonth = platformConfig.taxYear.startMonth;
  return Array.from({ length: 12 }, (_, i) => {
    const total = (taxYear - 1) * 12 + (startMonth - 1) + i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const label = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
    return { month: `${y}-${String(m).padStart(2, "0")}`, label };
  });
}

export function annualReport(
  all: ReportGift[],
  taxYear: number,
  campaignTitles: Map<string, string>,
  onIssuedReceipt: Set<string>,
  now: Date,
): AnnualReport {
  const { start, end } = taxYearRange(taxYear);
  const inYear = all.filter((g) => yearOf(g) === taxYear);
  const paid = inYear.filter((g) => g.status === "paid");
  const undone = inYear.filter((g) => g.status === "refunded" || g.status === "charged_back");

  // A donor is new this year when their first paid donation ever is in it (the same rule as the Overview and the Donors page).
  const firstYear = new Map<string, number>();
  for (const g of all) {
    if (g.status !== "paid") continue;
    const y = yearOf(g);
    if (y === null) continue;
    const was = firstYear.get(g.donor_id);
    if (was === undefined || y < was) firstYear.set(g.donor_id, y);
  }
  const donors = new Set(paid.map((g) => g.donor_id));
  let newDonors = 0;
  for (const d of donors) if (firstYear.get(d) === taxYear) newDonors++;

  const cents = (rows: ReportGift[]) => rows.reduce((t, g) => t + Number(g.amount_cents), 0);
  const totalCents = cents(paid);
  const monthlyCents = cents(paid.filter((g) => g.recurring_id));

  const months = taxYearMonths(taxYear).map((m) => ({ ...m, cents: 0, count: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const g of paid) {
    if (!g.paid_at) continue;
    const line = byMonth.get(saDate(new Date(g.paid_at)).slice(0, 7));
    if (!line) continue;
    line.cents += Number(g.amount_cents);
    line.count++;
  }
  const bestMonth = months.reduce<MonthLine | null>((best, m) => (m.cents > 0 && (!best || m.cents > best.cents) ? m : best), null);

  const camp = new Map<string, CampaignLine>();
  for (const g of paid) {
    if (!g.campaign_id) continue;
    const line = camp.get(g.campaign_id) ?? { id: g.campaign_id, title: campaignTitles.get(g.campaign_id) ?? "A campaign", cents: 0, count: 0 };
    line.cents += Number(g.amount_cents);
    line.count++;
    camp.set(g.campaign_id, line);
  }

  const asked = paid.filter((g) => g.wants_18a);
  const askedDonors = new Set(asked.map((g) => g.donor_id));
  const waiting = asked.filter((g) => !onIssuedReceipt.has(g.id));
  const waitingDonors = new Set(waiting.map((g) => g.donor_id));

  return {
    taxYear,
    running: taxYear >= taxYearFor(now),
    start,
    end,
    totalCents,
    donationCount: paid.length,
    donors: donors.size,
    newDonors,
    returningDonors: donors.size - newDonors,
    monthlyCents,
    onceOffCents: totalCents - monthlyCents,
    averageCents: averageCents(totalCents, paid.length),
    months,
    bestMonth,
    campaigns: [...camp.values()].sort((a, b) => b.cents - a.cents),
    refunded: { count: undone.length, cents: cents(undone) },
    s18a: { donors: askedDonors.size, receipted: askedDonors.size - waitingDonors.size, waitingCents: cents(waiting) },
  };
}
