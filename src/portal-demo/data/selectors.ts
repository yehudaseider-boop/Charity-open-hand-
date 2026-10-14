/**
 * Every number the portal shows is computed here from the one dataset, so the overview,
 * the donations table, campaign totals and the finance figures always agree.
 *
 * Definitions used everywhere:
 *   raised      paid donations (refunded, failed and pending excluded)
 *   gross       paid + refunded donations (everything that was charged and settled or will settle)
 *   net         gross - refunds - processing fees - platform fee
 * Periods filter by DONATION date unless a function says otherwise (payouts use payout date).
 */
import { DEMO_START, DEMO_TODAY } from "./demo-config";
import { addDays, addMonths, daysBetween, monthKey } from "./day";
import { localDay } from "./generate";
import type { Campaign, DemoDataset, Donation, Donor, RecurringPlan } from "./types";

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
  failedCount: number;
  pendingCount: number;
  refundedCents: number;
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
    failedCount: rows.filter((d) => d.status === "failed").length,
    pendingCount: rows.filter((d) => d.status === "pending").length,
    refundedCents: sum(rows.filter((d) => d.status === "refunded").map((d) => d.amountCents)),
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
  failedCount: number;
  refundedCents: number;
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
  const points = new Map<string, MonthPoint>(keys.map((k) => [k, { key: k, raisedCents: 0, onceCents: 0, monthlyCents: 0, count: 0, newDonors: 0, returningDonors: 0, cumulativeDonors: 0, failedCount: 0, refundedCents: 0 }]));
  const donorsByMonth = new Map<string, Set<string>>();
  for (const d of ds.donations) {
    const day = dayOf(d);
    if (!inRange(day, range)) continue;
    const p = points.get(monthKey(day));
    if (!p) continue;
    if (d.status === "failed") p.failedCount++;
    if (d.status === "refunded") p.refundedCents += d.amountCents;
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

export type DonorSegment = "new" | "active" | "lapsing" | "lapsed";

export const SEGMENT_LABELS: Record<DonorSegment, string> = {
  new: "New",
  active: "Active",
  lapsing: "Lapsing",
  lapsed: "Lapsed",
};

export type DonorStats = Donor & {
  name: string;
  totalCents: number;
  giftCount: number;
  firstDay: string | null;
  lastDay: string | null;
  segment: DonorSegment;
  hasMonthly: boolean;
  monthlyCents: number;
  campaignIds: string[];
  anyAnonymous: boolean;
  wants18a: boolean;
};

/**
 * Retention segment from the last gift: new (first gift in the last 60 days), active
 * (gave in the last 120 days), lapsing (120 to 240 days), lapsed (longer).
 */
export function segmentFor(firstDay: string | null, lastDay: string | null): DonorSegment {
  if (!lastDay || !firstDay) return "lapsed";
  if (daysBetween(firstDay, DEMO_TODAY) <= 60) return "new";
  const since = daysBetween(lastDay, DEMO_TODAY);
  if (since <= 120) return "active";
  if (since <= 240) return "lapsing";
  return "lapsed";
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
    return {
      ...donor,
      name: donorName(donor),
      totalCents: sum(paid.map((d) => d.amountCents)),
      giftCount: paid.length,
      firstDay,
      lastDay,
      segment: segmentFor(firstDay, lastDay),
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
  failedCount: number;
  cancelled: number;
  started: number;
};

export function recurringSeries(ds: DemoDataset, range: DateRange): RecurringMonth[] {
  return monthsIn(range).map((key) => {
    const monthEnd = addDays(addMonths(`${key}-01`, 1), -1);
    const charges = ds.donations.filter((d) => d.kind === "monthly" && monthKey(dayOf(d)) === key);
    const stoppedBy = (p: RecurringPlan) => {
      const stop = p.cancelledAt ?? p.pausedAt;
      return stop ? localDay(stop) <= monthEnd : false;
    };
    return {
      key,
      activeAtEnd: ds.recurring.filter((p) => localDay(p.startedAt) <= monthEnd && !stoppedBy(p)).length,
      collectedCents: sum(charges.filter((d) => d.status === "paid").map((d) => d.amountCents)),
      collectedCount: charges.filter((d) => d.status === "paid").length,
      failedCount: charges.filter((d) => d.status === "failed").length,
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
  failedCount: number;
  cancelledInRange: number;
  /** Plans still active out of those that existed at the start of the range, in permille. */
  retentionPermille: number | null;
};

export function recurringSummary(ds: DemoDataset, range: DateRange): RecurringSummary {
  const charges = ds.donations.filter((d) => d.kind === "monthly" && inRange(dayOf(d), range));
  const atStart = ds.recurring.filter((p) => localDay(p.startedAt) < range.from && !(p.cancelledAt && localDay(p.cancelledAt) < range.from) && !(p.pausedAt && localDay(p.pausedAt) < range.from));
  const kept = atStart.filter((p) => p.status === "active").length;
  return {
    active: ds.recurring.filter((p) => p.status === "active").length,
    paused: ds.recurring.filter((p) => p.status === "paused").length,
    cancelled: ds.recurring.filter((p) => p.status === "cancelled").length,
    expectedMonthlyCents: sum(ds.recurring.filter((p) => p.status === "active").map((p) => p.amountCents)),
    collectedCents: sum(charges.filter((d) => d.status === "paid").map((d) => d.amountCents)),
    collectedCount: charges.filter((d) => d.status === "paid").length,
    failedCount: charges.filter((d) => d.status === "failed").length,
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
  processingFeesCents: number;
  platformFeesCents: number;
  netCents: number;
  /** Of gross: where the money is now. */
  paidOutCents: number;
  inTransitCents: number;
  awaitingCents: number;
  pendingPaymentsCents: number;
  failedCents: number;
};

/** Finance figures for donations MADE in a range (by donation date). */
export function financeSummary(ds: DemoDataset, range: DateRange): FinanceSummary {
  const rows = ds.donations.filter((d) => inRange(dayOf(d), range));
  const charged = rows.filter((d) => d.status === "paid" || d.status === "refunded");
  const payoutStatus = new Map(ds.payouts.map((p) => [p.id, p.status]));
  const gross = sum(charged.map((d) => d.amountCents));
  const refunds = sum(charged.filter((d) => d.status === "refunded").map((d) => d.amountCents));
  const fees = sum(charged.map((d) => d.processingFeeCents));
  const platform = sum(charged.map((d) => d.platformFeeCents));
  const where = (s: "paid" | "in_transit" | null) => sum(charged.filter((d) => (d.payoutId ? payoutStatus.get(d.payoutId) : null) === s).map((d) => d.amountCents));
  return {
    grossCents: gross,
    refundsCents: refunds,
    processingFeesCents: fees,
    platformFeesCents: platform,
    netCents: gross - refunds - fees - platform,
    paidOutCents: where("paid"),
    inTransitCents: where("in_transit"),
    awaitingCents: where(null),
    pendingPaymentsCents: sum(rows.filter((d) => d.status === "pending").map((d) => d.amountCents)),
    failedCents: sum(rows.filter((d) => d.status === "failed").map((d) => d.amountCents)),
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
  /** Refunds made this week, taken off the next payout. */
  refundsCents: number;
  netCents: number;
};

/** Everything not yet in a payout: what the next payout will carry. */
export function pendingSettlement(ds: DemoDataset): PendingSettlement {
  const out = ds.donations.filter((d) => (d.status === "paid" || d.status === "refunded") && !d.payoutId);
  const notSettled = out.filter((d) => !d.settledAt);
  const settled = out.filter((d) => d.settledAt);
  const paidOutIds = new Set(ds.payouts.map((p) => p.id));
  // A refund is taken off the payout of the week it was made; refunds made this week are still to come.
  const thisWeekRefunds = ds.donations.filter((d) => d.status === "refunded" && d.refundedAt && !refundInPayout(d, ds, paidOutIds));
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
  const day = localDay(d.refundedAt!);
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
