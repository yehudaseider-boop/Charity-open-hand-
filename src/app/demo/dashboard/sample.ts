import type { OverviewProps } from "@/app/charity-admin/[id]/overview-view";
import { monthlySummary, thisTaxYear } from "@/lib/charity/dashboard";
import { countDonorGroups, donorGroupsFor, giftsPerDonor, lastMonths, monthlyAttention, topDonors } from "@/lib/charity/insights";
import { taxYearRange } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { demoData, donorFacts, type DemoData, type DemoGift } from "./data";

/** The demo charity: made up, and only ever shown at `/demo/dashboard`. */
export const DEMO_CHARITY = { name_en: "Sample Charity", slug: "sample-charity", status: "approved" } as const;
export const DEMO_BASE = "/demo/dashboard";
/** The demo treats donors as lapsed after a year, the dashboard's own default. */
export const DEMO_LAPSED_DAYS = 365;

const sum = (gifts: DemoGift[]) => gifts.reduce((t, g) => t + g.amountCents, 0);

/** The demo's gifts as rows of the dashboard's donations list (`DonationRow`), so the real Overview can draw them. */
export function asDonationRow(data: DemoData, g: DemoGift) {
  const d = data.donor(g.donorId)!;
  return {
    id: g.id, donor_id: d.id, status: g.status, amount_cents: g.amountCents, paid_at: g.paidAt, created_at: g.paidAt, refunded_at: null, charged_back_at: null, tax_year: null,
    wants_18a: g.wants18a, is_anonymous: false, message: null, dedication_kind: null, dedication_name: null, donor_type: "individual", first_name: d.first, last_name: d.last,
    organisation_name: null, registration_number: null, contact_person: null, email: d.email, phone: null, address_line1: null, address_line2: null, suburb: null, city: null,
    postal_code: null, recorded_method: g.recordedMethod, external_ref: null, came_from: g.source, campaign_id: g.campaignId,
  };
}

/** Everything the real Overview needs, worked out from the demo's records the way the real page works it out. */
export function demoOverview(now: Date = new Date(), data: DemoData = demoData(now)): OverviewProps {
  const paid = data.gifts.filter((g) => g.status === "paid");
  const inMonth = (m: string) => paid.filter((g) => monthOf(g.paidAt) === m);
  const rows = data.months.map((m) => {
    const gs = paid.filter((g) => monthOf(g.paidAt) === m);
    return { month: `${m}-01`, amountCents: sum(gs), monthlyCents: sum(gs.filter((g) => g.recurringId)), donationCount: gs.length };
  });
  const chart = lastMonths(rows, data.today, 12);
  const taxYear = thisTaxYear(now);
  const taxStart = taxYearRange(taxYear.taxYear).start;
  const inYear = paid.filter((g) => saDay(g.paidAt) >= taxStart);
  const current = data.months[11];
  const before = data.months[10];
  const facts = donorFacts(data);
  const ov = (gs: DemoGift[]) => ({
    paid_count: gs.length,
    paid_cents: sum(gs),
    donor_count: new Set(gs.map((g) => g.donorId)).size,
    receipt_requested_cents: sum(gs.filter((g) => g.wants18a)),
    refunded_count: data.gifts.filter((g) => g.status === "refunded").length,
    refunded_cents: sum(data.gifts.filter((g) => g.status === "refunded")),
    charged_back_count: data.gifts.filter((g) => g.status === "charged_back").length,
    pending_count: 0,
    failed_count: 0,
  });
  const newDonors = facts.filter((f) => monthOf(f.first_paid_at) === current).length;
  const repeat = facts.filter((f) => f.donation_count > 1).length;
  const needs = monthlyAttention(data.monthly, now);
  const base = DEMO_BASE;
  const todo: OverviewProps["todo"] = [];
  if (newDonors) todo.push({ key: "new", text: `${newDonors} new ${newDonors === 1 ? "donor" : "donors"} this month`, href: `${base}/thank-donors`, link: "Say thank you" });
  if (needs.retrying) todo.push({ key: "retry", text: `${needs.retrying} monthly ${needs.retrying === 1 ? "donation" : "donations"} declined this month and being tried again`, href: `${base}/monthly?show=running`, link: "See who" });
  const refunded = data.gifts.filter((g) => g.status === "refunded");
  if (refunded.length) todo.push({ key: "refund", text: `${refunded.length} donations refunded (${formatRand(sum(refunded))})`, href: `${base}/donations?status=refunded`, link: "See them" });

  return {
    charityName: DEMO_CHARITY.name_en,
    base,
    now,
    publicLink: "",
    month: ov(inMonth(current)),
    prev: ov(inMonth(before)),
    year: ov(inYear),
    all: ov(paid),
    taxYear,
    chart,
    recurring: data.monthly,
    regular: monthlySummary(data.monthly),
    sources: inYear.map((g) => ({ came_from: g.source })),
    recent: data.gifts.slice(0, 7).map((g) => asDonationRow(data, g)),
    campaigns: data.campaigns,
    activeCampaigns: data.campaigns,
    start: [],
    groups: countDonorGroups(facts, now, DEMO_LAPSED_DAYS),
    donorGroups: donorGroupsFor(DEMO_LAPSED_DAYS),
    insights: { newDonors, returningDonors: 0, repeatDonors: repeat, allDonors: facts.length, monthlyActive: monthlySummary(data.monthly).runningCount, monthlyActiveCents: monthlySummary(data.monthly).runningCentsPerMonth },
    donorCount: facts.length,
    top: topDonors(facts, 5),
    giftsTotal: paid.length,
    perDonor: giftsPerDonor(paid.length, facts.length),
    unit: null,
    receipts: true,
    todo,
  } as unknown as OverviewProps;
}

/** The Johannesburg calendar day (yyyy-mm-dd) and month (yyyy-mm) of a moment. */
export function saDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(iso));
}
export function monthOf(iso: string): string {
  return saDay(iso).slice(0, 7);
}
