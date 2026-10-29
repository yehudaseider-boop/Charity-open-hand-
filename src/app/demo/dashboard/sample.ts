import type { OverviewProps } from "@/app/charity-admin/[id]/overview-view";
import { monthlySummary, saDate, thisTaxYear } from "@/lib/charity/dashboard";
import { countDonorGroups, donorGroupsFor, lastMonths, topDonors } from "@/lib/charity/insights";
import { taxYearRange } from "@/lib/dates";

/**
 * Made-up figures for the public demonstration of the charity dashboard (`/demo/dashboard`). No database,
 * no sign-in and no real person: every surname is a placeholder word. Months and dates are worked out from
 * today, so the demo always looks current. Rand amounts are written in whole rand and stored as cents.
 */
export const DEMO_CHARITY = { name_en: "Sample Charity", slug: "sample-charity", status: "approved" } as const;
export const DEMO_BASE = "/demo/dashboard";

const cents = (rand: number) => rand * 100;
const DAY = 86_400_000;

/** Oldest first: what was given in each of the last 12 months, how much of it was monthly, and how many donations. */
const MONTHS: [number, number, number][] = [
  [9800, 2800, 19], [14600, 3000, 33], [8700, 3100, 17], [10400, 3300, 20], [11900, 3500, 21], [12800, 3600, 23],
  [13500, 3800, 24], [12100, 3900, 22], [14200, 4000, 26], [15300, 4100, 28], [16200, 4200, 29], [18450, 4200, 31],
];

/** `parts` shares out `total` by weight, whole numbers that add up exactly (the first share takes any remainder). */
export function share(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  out[0] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

export function demoOverview(now: Date = new Date()): OverviewProps {
  const today = saDate(now);
  const [ty, tm] = today.split("-").map(Number);
  const rows = MONTHS.map(([amount, monthly, count], i) => {
    const back = MONTHS.length - 1 - i;
    const d = new Date(Date.UTC(ty, tm - 1 - back, 1));
    return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`, amountCents: cents(amount), monthlyCents: cents(monthly), donationCount: count };
  });
  const chart = lastMonths(rows, today, 12);
  const taxYear = thisTaxYear(now);
  const taxStart = taxYearRange(taxYear.taxYear).start.slice(0, 7);
  const inYear = chart.filter((m) => m.month.slice(0, 7) >= taxStart);
  const yearCents = inYear.reduce((t, m) => t + m.amountCents, 0);
  const yearCount = inYear.reduce((t, m) => t + m.donationCount, 0);
  const current = chart[chart.length - 1];
  const before = chart[chart.length - 2];
  const ov = (paid: number, count: number, donors = 126) => ({ paid_count: count, paid_cents: paid, donor_count: donors, receipt_requested_cents: Math.round(paid * 0.54), refunded_count: 0, refunded_cents: 0, charged_back_count: 0, pending_count: 0, failed_count: 0 });

  // Where this tax year's gifts came from, adding up to exactly this tax year's donations.
  const keys = ["website", "share_link", "whatsapp", "qr", "app", "recorded", "website_button"];
  const sourceCounts = share(yearCount, [52, 38, 33, 29, 21, 17, 14]);
  const sources = keys.flatMap((k, i) => Array.from({ length: sourceCounts[i] }, () => ({ came_from: k })));

  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  const gift = (id: string, status: string, first: string, last: string, amount: number, from: string | null, campaign: string | null, s18a: boolean, hours: number) => ({
    id, status, amount_cents: cents(amount), paid_at: ago(hours), created_at: ago(hours), wants_18a: s18a, donor_type: "individual", first_name: first, last_name: last, organisation_name: null, email: `${id}@example.test`, came_from: from, campaign_id: campaign, recorded_method: null,
  });
  const donorRows = [["Sarah Demo", 14200, 21], ["Priya Mock", 9650, 14], ["Naledi Example", 7400, 18], ["David Testcase", 5200, 9], ["Thabo Sample", 4100, 12]].map(([name, total, count], i) => ({
    donor_id: `demo-donor-${i}`, donor_type: "individual", display_name: name as string, email: `donor${i}@example.test`, phone: null, donation_count: count as number, total_cents: cents(total as number),
    first_paid_at: ago(24 * 400), last_paid_at: ago(24 * (3 + i)), wants_18a: true, is_anonymous: false,
  }));
  const campaigns = [
    { id: "demo-c1", title: "Winter food parcels", description: null, targetCents: cents(50_000), endsAt: new Date(now.getTime() + 63 * DAY).toISOString(), status: "active", raisedCents: cents(31_400), giftCount: 86 },
    { id: "demo-c2", title: "School shoes", description: null, targetCents: cents(20_000), endsAt: new Date(now.getTime() + 120 * DAY).toISOString(), status: "active", raisedCents: cents(8_200), giftCount: 30 },
  ];
  const dueDay = new Date(now.getTime() - 2 * DAY);
  const dd = `${String(dueDay.getDate()).padStart(2, "0")}/${String(dueDay.getMonth() + 1).padStart(2, "0")}/${dueDay.getFullYear()}`;

  return {
    charityName: DEMO_CHARITY.name_en,
    base: DEMO_BASE,
    now,
    publicLink: "",
    month: ov(current.amountCents, current.donationCount),
    prev: ov(before.amountCents, before.donationCount),
    year: ov(yearCents, yearCount),
    all: ov(cents(287_650), 520),
    taxYear,
    chart,
    recurring: [],
    regular: { ...monthlySummary([]), runningCount: 14, runningCentsPerMonth: cents(4200) },
    sources,
    recent: [
      gift("demo-a1", "paid", "Naledi", "Example", 500, "website", null, true, 2),
      gift("demo-a2", "paid", "Thabo", "Sample", 250, "whatsapp", "demo-c1", true, 5),
      gift("demo-a3", "paid", "Sarah", "Demo", 1000, "app", null, false, 26),
      gift("demo-a4", "refunded", "Aisha", "Specimen", 180, "website", null, false, 50),
      gift("demo-a5", "paid", "Priya", "Mock", 750, "share_link", "demo-c2", false, 52),
      gift("demo-a6", "paid", "David", "Testcase", 120, "website_button", null, true, 74),
    ],
    campaigns,
    activeCampaigns: campaigns,
    start: [],
    groups: { ...countDonorGroups([], now, 365), new: 9, repeat: 58, once: 41, lapsed: 18 },
    donorGroups: donorGroupsFor(365),
    insights: { newDonors: 9, returningDonors: 40, repeatDonors: 58, allDonors: 126, monthlyActive: 14, monthlyActiveCents: cents(4200) },
    donorCount: 126,
    top: topDonors(donorRows, 4),
    giftsTotal: 520,
    perDonor: "4.1",
    unit: null,
    receipts: true,
    todo: [
      { key: "retry", text: "2 monthly donations declined this month and being tried again", href: `${DEMO_BASE}/monthly`, link: "See who" },
      { key: "follow", text: `Follow up with Johan Placeholder: call about his pledge (was due ${dd})`, href: `${DEMO_BASE}/donors`, link: "Open" },
      { key: "end", text: `"Winter food parcels" ends in 9 weeks, at 62% of its goal`, href: `${DEMO_BASE}/campaigns`, link: "Share it again" },
    ],
  } as unknown as OverviewProps;
}
