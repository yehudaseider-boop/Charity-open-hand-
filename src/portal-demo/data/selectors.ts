/**
 * Every number the portal shows is computed here from the one dataset, so the overview,
 * the donations table, campaign totals and the finance figures always agree.
 *
 * Definitions used everywhere:
 *   raised      paid donations (refunded and charged-back excluded)
 *   gross       paid + refunded + charged-back donations (everything that was charged and settled)
 *   net         gross - refunds - chargebacks - processing fees - platform fee
 * Charities never see pending or failed payments (decided 08/10/2026); they exist in the data only
 * so the demo behaves like the platform. Monthly donations that stop after failed payments show as
 * a monthly-donation status, not as failed payments.
 * Periods filter by DONATION date unless a function says otherwise (payouts use payout date).
 */
import { taxYearFor, taxYearRange } from "@/lib/dates";
import { CAMPAIGN_ENDING_SOON_DAYS, DEMO_START, DEMO_TODAY, GROUP_CONSISTENT_MIN, GROUP_NEW_DAYS, GROUP_WINDOW_DAYS, GROUP_WINDOWS, FOLLOW_UP_LARGE_DAYS, FOLLOW_UP_NEW_DAYS, PACE_AHEAD_PERCENT, PACE_ON_TRACK_PERCENT } from "./demo-config";
import { addDays, addMonths, daysBetween, monthKey } from "./day";
import { localDay } from "./generate";
import type { Campaign, DemoDataset, Donation, Donor, Payout, RecurringPlan } from "./types";

export type DateRange = { from: string; to: string };

export type RangePreset = "30d" | "90d" | "month" | "taxYear" | "12m" | "custom";

export const RANGE_LABELS: Record<RangePreset, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  month: "This month",
  taxYear: "This tax year",
  "12m": "Last 12 months",
  custom: "Custom dates",
};

export function presetRange(preset: Exclude<RangePreset, "custom">): DateRange {
  switch (preset) {
    case "30d":
      return { from: addDays(DEMO_TODAY, -29), to: DEMO_TODAY };
    case "90d":
      return { from: addDays(DEMO_TODAY, -89), to: DEMO_TODAY };
    case "month":
      return { from: `${DEMO_TODAY.slice(0, 7)}-01`, to: DEMO_TODAY };
    case "taxYear": {
      // SARS tax year starts 1 March.
      const y = Number(DEMO_TODAY.slice(0, 4));
      const start = DEMO_TODAY.slice(5, 7) >= "03" ? `${y}-03-01` : `${y - 1}-03-01`;
      return { from: start, to: DEMO_TODAY };
    }
    case "12m":
      return { from: addDays(DEMO_TODAY, -364), to: DEMO_TODAY };
  }
}

/** The period of the same length just before a range, for "compared with" figures. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

export const dayOf = (d: Donation) => localDay(d.donatedAt);

/** The donations a charity may see: paid, refunded and charged back. */
export const visibleToCharity = (d: Donation) => d.status === "paid" || d.status === "refunded" || d.status === "charged_back";

/** When a donation was reversed (refund or chargeback), or null. */
export const reversedAt = (d: Donation) => (d.status === "refunded" ? d.refundedAt : d.status === "charged_back" ? d.chargedBackAt : null);
export const inRange = (day: string, r: DateRange) => day >= r.from && day <= r.to;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function donorName(donor: Donor | undefined): string {
  if (!donor) return "Unknown donor";
  return donor.type === "company" ? `${donor.firstName} ${donor.lastName}` : `${donor.firstName} ${donor.lastName}`;
}

/** Day of each donor's first paid donation. */
export function firstGiftDays(ds: DemoDataset): Map<string, string> {
  const first = new Map<string, string>();
  for (const d of ds.donations) {
    if (d.status !== "paid") continue;
    const day = dayOf(d);
    const prev = first.get(d.donorId);
    if (!prev || day < prev) first.set(d.donorId, day);
  }
  return first;
}

export type PeriodSummary = {
  raisedCents: number;
  donationCount: number;
  averageCents: number;
  donorCount: number;
  newDonors: number;
  returningDonors: number;
  onceCents: number;
  monthlyCents: number;
  /** Refunded and charged-back donations, by donation date. */
  reversedCents: number;
};

export function summarise(ds: DemoDataset, range: DateRange, firsts = firstGiftDays(ds)): PeriodSummary {
  const rows = ds.donations.filter((d) => inRange(dayOf(d), range));
  const paid = rows.filter((d) => d.status === "paid");
  const donors = new Set(paid.map((d) => d.donorId));
  let newDonors = 0;
  for (const id of donors) if (inRange(firsts.get(id) ?? "", range)) newDonors++;
  const raised = sum(paid.map((d) => d.amountCents));
  return {
    raisedCents: raised,
    donationCount: paid.length,
    averageCents: paid.length ? Math.round(raised / paid.length) : 0,
    donorCount: donors.size,
    newDonors,
    returningDonors: donors.size - newDonors,
    onceCents: sum(paid.filter((d) => d.kind === "once").map((d) => d.amountCents)),
    monthlyCents: sum(paid.filter((d) => d.kind === "monthly").map((d) => d.amountCents)),
    reversedCents: sum(rows.filter((d) => d.status === "refunded" || d.status === "charged_back").map((d) => d.amountCents)),
  };
}

/** The same calendar days one month earlier: 01/10 to 14/10 gives 01/09 to 14/09 (clamped to the month's end). */
export function sameDaysLastMonth(range: DateRange): DateRange {
  const prevStart = addMonths(range.from, -1);
  const prevEnd = addDays(`${range.from.slice(0, 7)}-01`, -1);
  const to = `${prevStart.slice(0, 7)}-${range.to.slice(8, 10)}`;
  return { from: `${prevStart.slice(0, 7)}-${range.from.slice(8, 10)}`, to: to > prevEnd ? prevEnd : to };
}

/** True when the demo holds data for the whole period before `range`, so a comparison is fair. */
export function canCompare(range: DateRange): boolean {
  return previousRange(range).from >= DEMO_START;
}

/** Change as tenths of a percent (123 means +12.3%), or null when there is nothing to compare with. */
export function changeTenths(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) * 1000) / before);
}

export type MonthPoint = {
  key: string;
  raisedCents: number;
  onceCents: number;
  monthlyCents: number;
  count: number;
  newDonors: number;
  returningDonors: number;
  /** Donors who had given by the end of this month. */
  cumulativeDonors: number;
  reversedCents: number;
};

/** One point per calendar month that overlaps the range (at least one month). */
export function monthsIn(range: DateRange): string[] {
  const keys: string[] = [];
  let m = `${monthKey(range.from)}-01`;
  while (monthKey(m) <= monthKey(range.to)) {
    keys.push(monthKey(m));
    m = addMonths(m, 1);
  }
  return keys;
}

export function monthlySeries(ds: DemoDataset, range: DateRange, firsts = firstGiftDays(ds)): MonthPoint[] {
  const keys = monthsIn(range);
  const points = new Map<string, MonthPoint>(keys.map((k) => [k, { key: k, raisedCents: 0, onceCents: 0, monthlyCents: 0, count: 0, newDonors: 0, returningDonors: 0, cumulativeDonors: 0, reversedCents: 0 }]));
  const donorsByMonth = new Map<string, Set<string>>();
  for (const d of ds.donations) {
    const day = dayOf(d);
    if (!inRange(day, range)) continue;
    const p = points.get(monthKey(day));
    if (!p) continue;
    if (d.status === "refunded" || d.status === "charged_back") p.reversedCents += d.amountCents;
    if (d.status !== "paid") continue;
    p.raisedCents += d.amountCents;
    p.count++;
    if (d.kind === "once") p.onceCents += d.amountCents;
    else p.monthlyCents += d.amountCents;
    const set = donorsByMonth.get(p.key) ?? new Set();
    set.add(d.donorId);
    donorsByMonth.set(p.key, set);
  }
  for (const p of points.values()) {
    for (const id of donorsByMonth.get(p.key) ?? []) {
      if (monthKey(firsts.get(id) ?? "") === p.key) p.newDonors++;
      else p.returningDonors++;
    }
    const monthEnd = addDays(addMonths(`${p.key}-01`, 1), -1);
    let c = 0;
    for (const day of firsts.values()) if (day <= monthEnd) c++;
    p.cumulativeDonors = c;
  }
  return keys.map((k) => points.get(k)!);
}

export type CampaignStats = Campaign & {
  raisedCents: number;
  donationCount: number;
  donorCount: number;
  progressPermille: number;
  lastDonationDay: string | null;
  averageCents: number;
};

export function campaignStats(ds: DemoDataset, campaigns: Campaign[] = ds.campaigns): CampaignStats[] {
  return campaigns.map((c) => {
    const paid = ds.donations.filter((d) => d.campaignId === c.id && d.status === "paid");
    const raised = sum(paid.map((d) => d.amountCents));
    return {
      ...c,
      raisedCents: raised,
      donationCount: paid.length,
      donorCount: new Set(paid.map((d) => d.donorId)).size,
      progressPermille: c.goalCents > 0 ? Math.round((raised * 1000) / c.goalCents) : 0,
      lastDonationDay: paid.length ? paid.map(dayOf).sort().at(-1)! : null,
      averageCents: paid.length ? Math.round(raised / paid.length) : 0,
    };
  });
}

/** Cumulative raised per day for one campaign, from its start to today or its end. */
export function campaignCumulative(ds: DemoDataset, c: Campaign): { day: string; cents: number }[] {
  const end = c.endDate && c.endDate < DEMO_TODAY ? c.endDate : DEMO_TODAY;
  if (c.startDate > end) return [];
  const byDay = new Map<string, number>();
  for (const d of ds.donations) if (d.campaignId === c.id && d.status === "paid") byDay.set(dayOf(d), (byDay.get(dayOf(d)) ?? 0) + d.amountCents);
  const out: { day: string; cents: number }[] = [];
  let run = 0;
  for (let day = c.startDate; day <= end; day = addDays(day, 1)) {
    run += byDay.get(day) ?? 0;
    out.push({ day, cents: run });
  }
  return out;
}

export type DonorGroup = "consistent" | "occasional" | "new" | "decreasing" | "inactive";

export const GROUP_ORDER: DonorGroup[] = ["consistent", "occasional", "new", "decreasing", "inactive"];

export const GROUP_LABELS: Record<DonorGroup, string> = {
  consistent: "Consistent",
  occasional: "Occasional",
  new: "New",
  decreasing: "Decreasing",
  inactive: "Inactive",
};

/** One line per group, shown on screen, so a charity can see exactly why someone is in it. */
export const GROUP_RULES: Record<DonorGroup, string> = {
  new: `First donation in the last ${GROUP_NEW_DAYS} days.`,
  consistent: `Gave in at least ${GROUP_CONSISTENT_MIN} of the last ${GROUP_WINDOWS} months.`,
  decreasing: `Gave in at least ${GROUP_CONSISTENT_MIN} of the ${GROUP_WINDOWS} months before that, but less often since.`,
  occasional: "Gives now and then, without a regular pattern.",
  inactive: `No donation in the last ${GROUP_WINDOWS} months.`,
};

export type DonorStats = Donor & {
  name: string;
  totalCents: number;
  giftCount: number;
  firstDay: string | null;
  lastDay: string | null;
  group: DonorGroup;
  /** Of the last GROUP_WINDOWS 30-day windows, how many had a paid donation. */
  recentWindows: number;
  /** The same for the GROUP_WINDOWS windows before those. */
  priorWindows: number;
  hasMonthly: boolean;
  monthlyCents: number;
  campaignIds: string[];
  anyAnonymous: boolean;
  wants18a: boolean;
};

/** How many 30-day windows had a donation: [last six, the six before]. Window 0 ends today. */
export function givingWindows(paidDays: string[]): [number, number] {
  const hit = new Set<number>();
  for (const day of paidDays) {
    const w = Math.floor(daysBetween(day, DEMO_TODAY) / GROUP_WINDOW_DAYS);
    if (w >= 0 && w < GROUP_WINDOWS * 2) hit.add(w);
  }
  let recent = 0;
  let prior = 0;
  for (const w of hit) {
    if (w < GROUP_WINDOWS) recent++;
    else prior++;
  }
  return [recent, prior];
}

/** Giving group from the donor's paid donations. Checked in order: new, inactive, consistent, decreasing, occasional. */
export function groupFor(firstDay: string | null, recent: number, prior: number): DonorGroup {
  if (!firstDay) return "inactive";
  if (daysBetween(firstDay, DEMO_TODAY) < GROUP_NEW_DAYS) return "new";
  if (recent === 0) return "inactive";
  if (recent >= GROUP_CONSISTENT_MIN) return "consistent";
  if (prior >= GROUP_CONSISTENT_MIN) return "decreasing";
  return "occasional";
}

export function donorStats(ds: DemoDataset): DonorStats[] {
  const byDonor = new Map<string, Donation[]>();
  for (const d of ds.donations) {
    const list = byDonor.get(d.donorId) ?? [];
    list.push(d);
    byDonor.set(d.donorId, list);
  }
  const activePlans = new Map<string, RecurringPlan[]>();
  for (const p of ds.recurring) if (p.status === "active") activePlans.set(p.donorId, [...(activePlans.get(p.donorId) ?? []), p]);
  return ds.donors.map((donor) => {
    const all = byDonor.get(donor.id) ?? [];
    const paid = all.filter((d) => d.status === "paid");
    const days = paid.map(dayOf).sort();
    const plans = activePlans.get(donor.id) ?? [];
    const firstDay = days[0] ?? null;
    const lastDay = days.at(-1) ?? null;
    const [recentWindows, priorWindows] = givingWindows(days);
    return {
      ...donor,
      name: donorName(donor),
      totalCents: sum(paid.map((d) => d.amountCents)),
      giftCount: paid.length,
      firstDay,
      lastDay,
      group: groupFor(firstDay, recentWindows, priorWindows),
      recentWindows,
      priorWindows,
      hasMonthly: plans.length > 0,
      monthlyCents: sum(plans.map((p) => p.amountCents)),
      campaignIds: [...new Set(paid.map((d) => d.campaignId).filter((x): x is string => !!x))],
      anyAnonymous: all.some((d) => d.anonymous),
      wants18a: all.some((d) => d.wants18a),
    };
  });
}

export type RecurringMonth = {
  key: string;
  activeAtEnd: number;
  collectedCents: number;
  collectedCount: number;
  /** Monthly donations that stopped this month after failed payments. */
  stoppedFailed: number;
  cancelled: number;
  started: number;
};

/** The day a monthly donation stopped being active (cancelled, paused or failed), or null. */
export const planStoppedDay = (p: RecurringPlan) => {
  const stop = p.cancelledAt ?? p.pausedAt ?? p.failedAt;
  return stop ? localDay(stop) : null;
};

export function recurringSeries(ds: DemoDataset, range: DateRange): RecurringMonth[] {
  return monthsIn(range).map((key) => {
    const monthEnd = addDays(addMonths(`${key}-01`, 1), -1);
    const charges = ds.donations.filter((d) => d.kind === "monthly" && monthKey(dayOf(d)) === key);
    const stoppedBy = (p: RecurringPlan) => {
      const stop = planStoppedDay(p);
      return stop ? stop <= monthEnd : false;
    };
    return {
      key,
      activeAtEnd: ds.recurring.filter((p) => localDay(p.startedAt) <= monthEnd && !stoppedBy(p)).length,
      collectedCents: sum(charges.filter((d) => d.status === "paid").map((d) => d.amountCents)),
      collectedCount: charges.filter((d) => d.status === "paid").length,
      stoppedFailed: ds.recurring.filter((p) => p.failedAt && monthKey(localDay(p.failedAt)) === key).length,
      cancelled: ds.recurring.filter((p) => p.cancelledAt && monthKey(localDay(p.cancelledAt)) === key).length,
      started: ds.recurring.filter((p) => monthKey(localDay(p.startedAt)) === key).length,
    };
  });
}

export type RecurringSummary = {
  active: number;
  paused: number;
  cancelled: number;
  expectedMonthlyCents: number;
  collectedCents: number;
  collectedCount: number;
  /** Monthly donations stopped after failed payments: all of them, and in the period. */
  failedPlans: number;
  failedInRange: number;
  cancelledInRange: number;
  /** Plans still active out of those that existed at the start of the range, in permille. */
  retentionPermille: number | null;
};

export function recurringSummary(ds: DemoDataset, range: DateRange): RecurringSummary {
  const charges = ds.donations.filter((d) => d.kind === "monthly" && inRange(dayOf(d), range));
  const stopped = (p: RecurringPlan, before: string) => {
    const day = planStoppedDay(p);
    return day !== null && day < before;
  };
  // Plans active when the period began, and how many of them were still active when it ended.
  const atStart = ds.recurring.filter((p) => localDay(p.startedAt) < range.from && !stopped(p, range.from));
  const kept = atStart.filter((p) => !stopped(p, addDays(range.to, 1))).length;
  return {
    active: ds.recurring.filter((p) => p.status === "active").length,
    paused: ds.recurring.filter((p) => p.status === "paused").length,
    cancelled: ds.recurring.filter((p) => p.status === "cancelled").length,
    expectedMonthlyCents: sum(ds.recurring.filter((p) => p.status === "active").map((p) => p.amountCents)),
    collectedCents: sum(charges.filter((d) => d.status === "paid").map((d) => d.amountCents)),
    collectedCount: charges.filter((d) => d.status === "paid").length,
    failedPlans: ds.recurring.filter((p) => p.status === "failed").length,
    failedInRange: ds.recurring.filter((p) => p.failedAt && inRange(localDay(p.failedAt), range)).length,
    cancelledInRange: ds.recurring.filter((p) => p.cancelledAt && inRange(localDay(p.cancelledAt), range)).length,
    retentionPermille: atStart.length ? Math.round((kept * 1000) / atStart.length) : null,
  };
}

/** Next charge day for an active plan, from the demo's today. */
export function nextChargeDay(p: RecurringPlan): string | null {
  if (p.status !== "active") return null;
  const dom = String(p.dayOfMonth).padStart(2, "0");
  const thisMonth = `${DEMO_TODAY.slice(0, 7)}-${dom}`;
  return thisMonth > DEMO_TODAY ? thisMonth : `${addMonths(DEMO_TODAY, 1).slice(0, 7)}-${dom}`;
}

export type FinanceSummary = {
  grossCents: number;
  refundsCents: number;
  chargebacksCents: number;
  processingFeesCents: number;
  platformFeesCents: number;
  netCents: number;
  /** Of gross: where the money is now. */
  paidOutCents: number;
  inTransitCents: number;
  awaitingCents: number;
};

/** Finance figures for donations MADE in a range (by donation date). */
export function financeSummary(ds: DemoDataset, range: DateRange): FinanceSummary {
  const rows = ds.donations.filter((d) => inRange(dayOf(d), range));
  const charged = rows.filter(visibleToCharity);
  const payoutStatus = new Map(ds.payouts.map((p) => [p.id, p.status]));
  const gross = sum(charged.map((d) => d.amountCents));
  const refunds = sum(charged.filter((d) => d.status === "refunded").map((d) => d.amountCents));
  const chargebacks = sum(charged.filter((d) => d.status === "charged_back").map((d) => d.amountCents));
  const fees = sum(charged.map((d) => d.processingFeeCents));
  const platform = sum(charged.map((d) => d.platformFeeCents));
  const where = (s: "paid" | "in_transit" | null) => sum(charged.filter((d) => (d.payoutId ? payoutStatus.get(d.payoutId) : null) === s).map((d) => d.amountCents));
  return {
    grossCents: gross,
    refundsCents: refunds,
    chargebacksCents: chargebacks,
    processingFeesCents: fees,
    platformFeesCents: platform,
    netCents: gross - refunds - chargebacks - fees - platform,
    paidOutCents: where("paid"),
    inTransitCents: where("in_transit"),
    awaitingCents: where(null),
  };
}

export type PendingSettlement = {
  /** Paid, but the payment provider has not settled it yet. */
  notSettledCents: number;
  notSettledCount: number;
  /** Settled this week; goes out in the next payout. */
  settledCents: number;
  settledCount: number;
  feesCents: number;
  /** Refunds and chargebacks made this week, taken off the next payout. */
  refundsCents: number;
  netCents: number;
};

/** Everything not yet in a payout: what the next payout will carry. */
export function pendingSettlement(ds: DemoDataset): PendingSettlement {
  const out = ds.donations.filter((d) => visibleToCharity(d) && !d.payoutId);
  const notSettled = out.filter((d) => !d.settledAt);
  const settled = out.filter((d) => d.settledAt);
  const paidOutIds = new Set(ds.payouts.map((p) => p.id));
  // A refund or chargeback is taken off the payout of the week it happened; this week's are still to come.
  const thisWeekRefunds = ds.donations.filter((d) => reversedAt(d) && !refundInPayout(d, ds, paidOutIds));
  const fees = sum(out.map((d) => d.processingFeeCents + d.platformFeeCents));
  const refunds = sum(thisWeekRefunds.map((d) => d.amountCents));
  const gross = sum(out.map((d) => d.amountCents));
  return {
    notSettledCents: sum(notSettled.map((d) => d.amountCents)),
    notSettledCount: notSettled.length,
    settledCents: sum(settled.map((d) => d.amountCents)),
    settledCount: settled.length,
    feesCents: fees,
    refundsCents: refunds,
    netCents: gross - fees - refunds,
  };
}

function refundInPayout(d: Donation, ds: DemoDataset, ids: Set<string>): boolean {
  const day = localDay(reversedAt(d)!);
  return ds.payouts.some((p) => ids.has(p.id) && day >= p.periodStart && day <= p.periodEnd);
}

export type AmountBucket = { label: string; min: number; max: number | null; count: number; cents: number };

const BUCKETS: [string, number, number | null][] = [
  ["Under R100", 0, 10_000],
  ["R100 to R249", 10_000, 25_000],
  ["R250 to R499", 25_000, 50_000],
  ["R500 to R999", 50_000, 100_000],
  ["R1 000 to R2 499", 100_000, 250_000],
  ["R2 500 to R4 999", 250_000, 500_000],
  ["R5 000 and more", 500_000, null],
];

export function amountDistribution(ds: DemoDataset, range: DateRange): AmountBucket[] {
  const paid = ds.donations.filter((d) => d.status === "paid" && inRange(dayOf(d), range));
  return BUCKETS.map(([label, min, max]) => {
    const inB = paid.filter((d) => d.amountCents >= min && (max === null || d.amountCents < max));
    return { label, min, max, count: inB.length, cents: sum(inB.map((d) => d.amountCents)) };
  });
}

/** Stable yes/no per donor for demo-only traits, so every reload agrees. `percent` is the chance of true. */
export function demoFlag(id: string, salt: string, percent: number): boolean {
  let h = 2166136261;
  for (const c of `${salt}:${id}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100 < percent;
}

/** Demo trait: the donor agreed to hear about appeals (marketing consent). Thank-yous do not need it. */
export const hasMarketingConsent = (d: Donor) => demoFlag(d.id, "marketing", 65);

/**
 * The platform's checkout will not take an s18A request without the details a receipt needs (ID or
 * tax number, or a company's registration number), so a receipt is either issued or waiting for
 * the tax year to close.
 */
export type S18aStatus = "issued" | "after_year_end";

export type S18aReceipt = {
  /** Null until issued. */
  number: string | null;
  taxYear: number;
  donorId: string;
  /** Donation amounts only, never the processing fee. */
  totalCents: number;
  donationIds: string[];
  status: S18aStatus;
  issuedOn: string | null;
};

export const currentTaxYear = () => taxYearFor(`${DEMO_TODAY}T12:00:00Z`);

export function isTaxYearClosed(taxYear: number): boolean {
  return taxYearRange(taxYear).end < DEMO_TODAY;
}

/**
 * One annual receipt per donor per tax year, covering paid donations that asked for an s18A
 * receipt. Refunded, charged-back, failed and pending donations never count. Receipts are issued
 * after the tax year closes. Charities without s18A approval have none.
 */
export function s18aReceipts(ds: DemoDataset, taxYear: number): S18aReceipt[] {
  if (!ds.charity.s18a) return [];
  const byDonor = new Map<string, Donation[]>();
  for (const d of ds.donations) {
    if (d.status !== "paid" || !d.wants18a || taxYearFor(d.donatedAt) !== taxYear) continue;
    byDonor.set(d.donorId, [...(byDonor.get(d.donorId) ?? []), d]);
  }
  const closed = isTaxYearClosed(taxYear);
  const { end } = taxYearRange(taxYear);
  const ordered = [...byDonor.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let n = 0;
  return ordered.map(([donorId, list]) => {
    const status: S18aStatus = closed ? "issued" : "after_year_end";
    return {
      number: status === "issued" ? `${ds.charity.initials}-${taxYear}-${String(++n).padStart(4, "0")}` : null,
      taxYear,
      donorId,
      totalCents: sum(list.map((d) => d.amountCents)),
      donationIds: list.sort((a, b) => (a.donatedAt < b.donatedAt ? -1 : 1)).map((d) => d.id),
      status,
      issuedOn: status === "issued" ? addDays(end, 14) : null,
    };
  });
}

export type S18aSummary = {
  taxYear: number;
  start: string;
  end: string;
  closed: boolean;
  daysToYearEnd: number;
  yearElapsedPermille: number;
  donationCount: number;
  totalCents: number;
  donors: number;
  issued: number;
  afterYearEnd: number;
};

export function s18aSummary(ds: DemoDataset, taxYear: number): S18aSummary {
  const { start, end } = taxYearRange(taxYear);
  const receipts = s18aReceipts(ds, taxYear);
  const total = daysBetween(start, end) + 1;
  const elapsed = Math.max(0, Math.min(total, daysBetween(start, DEMO_TODAY) + 1));
  return {
    taxYear,
    start,
    end,
    closed: isTaxYearClosed(taxYear),
    daysToYearEnd: Math.max(0, daysBetween(DEMO_TODAY, end)),
    yearElapsedPermille: Math.round((elapsed * 1000) / total),
    donationCount: receipts.reduce((s, r) => s + r.donationIds.length, 0),
    totalCents: sum(receipts.map((r) => r.totalCents)),
    donors: receipts.length,
    issued: receipts.filter((r) => r.status === "issued").length,
    afterYearEnd: receipts.filter((r) => r.status === "after_year_end").length,
  };
}

export type PaceState = "reached" | "ahead" | "on_track" | "behind";

export type CampaignPace = { state: PaceState; remainingDays: number; neededPerDayCents: number };

/**
 * Where an active campaign stands against an even pace to its goal by its end date.
 * Null for campaigns that are not active or have no end date (no pace to measure).
 */
export function campaignPace(c: Pick<CampaignStats, "status" | "raisedCents" | "goalCents" | "startDate" | "endDate">): CampaignPace | null {
  if (c.status !== "active") return null;
  if (c.raisedCents >= c.goalCents) return { state: "reached", remainingDays: 0, neededPerDayCents: 0 };
  if (!c.endDate) return null;
  const total = daysBetween(c.startDate, c.endDate) + 1;
  const elapsed = Math.min(total, Math.max(0, daysBetween(c.startDate, DEMO_TODAY) + 1));
  const remainingDays = Math.max(0, daysBetween(DEMO_TODAY, c.endDate));
  const expected = Math.round((c.goalCents * elapsed) / total);
  const state: PaceState = c.raisedCents * 100 >= expected * PACE_AHEAD_PERCENT ? "ahead" : c.raisedCents * 100 >= expected * PACE_ON_TRACK_PERCENT ? "on_track" : "behind";
  const gap = c.goalCents - c.raisedCents;
  return { state, remainingDays, neededPerDayCents: remainingDays > 0 ? Math.ceil(gap / remainingDays) : gap };
}

export type FollowUpKind = "new" | "large" | "checkin" | "winback";

export type FollowUpRow = {
  /** Handled marker key: `${kind}:${id}`. */
  key: string;
  kind: FollowUpKind;
  donor: DonorStats;
  donationId: string | null;
  /** The donation that triggered it, or the donor's average donation for a check-in or win-back. */
  amountCents: number;
  day: string;
  campaignId: string | null;
  wants18a: boolean;
};

export type FollowUps = Record<FollowUpKind, FollowUpRow[]> & {
  /** Decreasing and inactive donors left out because they did not agree to hear about appeals. */
  checkinHiddenNoConsent: number;
  winbackHiddenNoConsent: number;
};

/**
 * Who deserves a message. New: first donation in the last FOLLOW_UP_NEW_DAYS days. Large: a paid
 * donation of at least `largeCents` in the last FOLLOW_UP_LARGE_DAYS days. Check in: Decreasing donors.
 * Win back: Inactive donors who gave more than once. Check-ins and win-backs ask for money, so only
 * donors who agreed to hear about appeals are listed.
 */
export function followUps(ds: DemoDataset, largeCents: number, stats: DonorStats[] = donorStats(ds)): FollowUps {
  const byId = new Map(stats.map((d) => [d.id, d]));
  const paid = ds.donations.filter((d) => d.status === "paid");
  const row = (kind: FollowUpKind, id: string, donor: DonorStats, d: Donation | null, amountCents: number, day: string): FollowUpRow => ({
    key: `${kind}:${id}`,
    kind,
    donor,
    donationId: d?.id ?? null,
    amountCents,
    day,
    campaignId: d?.campaignId ?? null,
    wants18a: !!d?.wants18a,
  });
  const out: FollowUps = { new: [], large: [], checkin: [], winback: [], checkinHiddenNoConsent: 0, winbackHiddenNoConsent: 0 };
  for (const donor of stats) {
    if (donor.firstDay && daysBetween(donor.firstDay, DEMO_TODAY) <= FOLLOW_UP_NEW_DAYS) {
      const first = paid.filter((d) => d.donorId === donor.id).sort((a, b) => (a.donatedAt < b.donatedAt ? -1 : 1))[0];
      if (first) out.new.push(row("new", donor.id, donor, first, first.amountCents, dayOf(first)));
    }
  }
  for (const d of paid) {
    const donor = byId.get(d.donorId);
    if (donor && d.amountCents >= largeCents && daysBetween(dayOf(d), DEMO_TODAY) <= FOLLOW_UP_LARGE_DAYS) out.large.push(row("large", d.id, donor, d, d.amountCents, dayOf(d)));
  }
  for (const donor of stats) {
    if (!donor.lastDay) continue;
    const kind = donor.group === "decreasing" ? "checkin" : donor.group === "inactive" && donor.giftCount >= 2 ? "winback" : null;
    if (!kind) continue;
    if (!hasMarketingConsent(donor)) {
      if (kind === "checkin") out.checkinHiddenNoConsent++;
      else out.winbackHiddenNoConsent++;
      continue;
    }
    out[kind].push(row(kind, donor.id, donor, null, Math.round(donor.totalCents / donor.giftCount), donor.lastDay));
  }
  out.new.sort((a, b) => (a.day < b.day ? 1 : -1));
  out.large.sort((a, b) => b.amountCents - a.amountCents);
  out.checkin.sort((a, b) => b.donor.totalCents - a.donor.totalCents);
  out.winback.sort((a, b) => b.donor.totalCents - a.donor.totalCents);
  return out;
}

export type AttentionKind = "monthly_stopped" | "large_donation" | "new_donors" | "giving_less" | "campaign_behind" | "campaign_ending";

export type AttentionItem = {
  key: string;
  kind: AttentionKind;
  /** 1 most urgent. */
  priority: 1 | 2 | 3;
  count: number;
  amountCents?: number;
  campaignId?: string;
  campaignName?: string;
  daysLeft?: number;
  neededPerDayCents?: number;
  progressPermille?: number;
};

/** What a charity should look at today, most urgent first. `handled` holds follow-up keys already done. */
export function attentionItems(ds: DemoDataset, opts: { largeCents: number; handled: Record<string, string> }): AttentionItem[] {
  const items: AttentionItem[] = [];
  const stats = donorStats(ds);
  const fu = followUps(ds, opts.largeCents, stats);

  // Monthly donations that stopped after failed payments in the last 30 days: worth a personal call.
  const stopped = ds.recurring.filter((p) => p.status === "failed" && p.failedAt && daysBetween(localDay(p.failedAt), DEMO_TODAY) <= 30);
  if (stopped.length) items.push({ key: "monthly_stopped", kind: "monthly_stopped", priority: 1, count: stopped.length, amountCents: sum(stopped.map((p) => p.amountCents)) });

  for (const c of campaignStats(ds)) {
    const pace = campaignPace(c);
    if (pace?.state === "behind" && pace.remainingDays > 0) {
      items.push({ key: `behind:${c.id}`, kind: "campaign_behind", priority: 2, count: 1, campaignId: c.id, campaignName: c.name, daysLeft: pace.remainingDays, neededPerDayCents: pace.neededPerDayCents, progressPermille: c.progressPermille });
    } else if (c.status === "active" && c.endDate && pace?.state !== "reached") {
      const left = daysBetween(DEMO_TODAY, c.endDate);
      if (left >= 0 && left <= CAMPAIGN_ENDING_SOON_DAYS) items.push({ key: `ending:${c.id}`, kind: "campaign_ending", priority: 3, count: 1, campaignId: c.id, campaignName: c.name, daysLeft: left, progressPermille: c.progressPermille });
    }
  }

  const large = fu.large.filter((r) => !opts.handled[r.key]);
  if (large.length) items.push({ key: "large_donation", kind: "large_donation", priority: 2, count: large.length, amountCents: sum(large.map((r) => r.amountCents)) });
  const less = fu.checkin.filter((r) => !opts.handled[r.key]);
  if (less.length) items.push({ key: "giving_less", kind: "giving_less", priority: 2, count: less.length, amountCents: sum(less.map((r) => r.amountCents)) });
  const fresh = fu.new.filter((r) => !opts.handled[r.key]);
  if (fresh.length) items.push({ key: "new_donors", kind: "new_donors", priority: 3, count: fresh.length });

  return items.sort((a, b) => a.priority - b.priority);
}

/** What appears on the charity's bank statement for a deposit (demo format until the payment provider's is known). */
export const statementRef = (p: Payout) => `GIVEZY ${p.ref}`;

export type DepositLine = {
  payoutId: string;
  kind: "donation" | "refund" | "chargeback";
  donationId: string;
  /** Donation date for a donation line; refund date for a refund line. */
  day: string;
  donorId: string;
  campaignId: string | null;
  donationKind: Donation["kind"];
  grossCents: number;
  feeCents: number;
  refundCents: number;
  netCents: number;
};

/**
 * Every line behind one bank deposit: each donation settled in its week (gross, fee, net) and each
 * refund made that week (a negative line). The lines always add up to the deposit, to the cent.
 */
export function depositLines(ds: DemoDataset, payout: Payout): DepositLine[] {
  const lines: DepositLine[] = [];
  for (const d of ds.donations) {
    if (d.payoutId === payout.id) {
      const fee = d.processingFeeCents + d.platformFeeCents;
      lines.push({ payoutId: payout.id, kind: "donation", donationId: d.id, day: dayOf(d), donorId: d.donorId, campaignId: d.campaignId, donationKind: d.kind, grossCents: d.amountCents, feeCents: fee, refundCents: 0, netCents: d.amountCents - fee });
    }
    const reversed = reversedAt(d);
    if (reversed) {
      const day = localDay(reversed);
      if (day >= payout.periodStart && day <= payout.periodEnd) {
        lines.push({ payoutId: payout.id, kind: d.status === "charged_back" ? "chargeback" : "refund", donationId: d.id, day, donorId: d.donorId, campaignId: d.campaignId, donationKind: d.kind, grossCents: 0, feeCents: 0, refundCents: d.amountCents, netCents: -d.amountCents });
      }
    }
  }
  return lines.sort((a, b) => (a.kind === b.kind ? (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) : a.kind === "donation" ? -1 : 1));
}

export type FundLine = { campaignId: string | null; count: number; grossCents: number; feeCents: number; refundCents: number; netCents: number };

/** One row per campaign (fund) inside a deposit, for an accounting journal. Adds up to the deposit. */
export function depositByFund(lines: DepositLine[]): FundLine[] {
  const by = new Map<string, FundLine>();
  for (const l of lines) {
    const key = l.campaignId ?? "";
    const f = by.get(key) ?? { campaignId: l.campaignId, count: 0, grossCents: 0, feeCents: 0, refundCents: 0, netCents: 0 };
    if (l.kind === "donation") f.count++;
    f.grossCents += l.grossCents;
    f.feeCents += l.feeCents;
    f.refundCents += l.refundCents;
    f.netCents += l.netCents;
    by.set(key, f);
  }
  return [...by.values()].sort((a, b) => b.netCents - a.netCents);
}
