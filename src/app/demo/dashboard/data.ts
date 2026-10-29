import { saDate, type MonthlyRow } from "@/lib/charity/dashboard";

/**
 * Made-up records for the public dashboard demo (`/demo/dashboard`): 126 donors, a year of gifts, 16 monthly
 * donations and two campaigns. No database and no real person: every surname is a placeholder word and every
 * address ends in example.test. The same records feed every demo page, so the figures agree from page to page.
 * Generated from a fixed seed, with months counted back from today, so the demo always looks current.
 */

const FIRST = ["Naledi", "Thabo", "Sarah", "Priya", "David", "Aisha", "Johan", "Lerato", "Michael", "Zanele", "Ruth", "Sipho", "Leah", "Pieter", "Fatima", "Daniel", "Nomsa", "Ari"];
const LAST = ["Example", "Sample", "Demo", "Placeholder", "Specimen", "Mock", "Testcase"];
export const DEMO_DONOR_COUNT = FIRST.length * LAST.length; // 126

export type DemoDonor = { id: string; first: string; last: string; name: string; email: string; wants18a: boolean };
export type DemoGift = {
  id: string;
  donorId: string;
  amountCents: number;
  paidAt: string;
  status: "paid" | "refunded" | "charged_back";
  source: string;
  campaignId: string | null;
  recurringId: string | null;
  wants18a: boolean;
  recordedMethod: string | null;
};
export type DemoCampaign = { id: string; title: string; description: string; targetCents: number; endsAt: string; status: string; raisedCents: number; giftCount: number };

/** A small, fixed pseudo-random sequence, so the demo is the same on every visit. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: [T, number][]): T {
  const total = items.reduce((t, [, w]) => t + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAY = 86_400_000;

/** One monthly donation: whose, how much, from which month (0 = eleven months ago) and what has happened since. */
const MONTHLY: { donor: number; rand: number; start: number; pausedFrom?: number; endedFrom?: number; retrying?: boolean }[] = [
  ...[0, 1, 2, 3, 4, 5].map((donor) => ({ donor, rand: 350, start: 0 })),
  { donor: 6, rand: 350, start: 0, retrying: true },
  { donor: 7, rand: 350, start: 0, retrying: true },
  { donor: 8, rand: 200, start: 1 },
  { donor: 9, rand: 200, start: 3 },
  { donor: 10, rand: 250, start: 5 },
  { donor: 11, rand: 250, start: 7 },
  { donor: 12, rand: 250, start: 9 },
  { donor: 13, rand: 250, start: 10 },
  { donor: 120, rand: 200, start: 2, pausedFrom: 8 },
  { donor: 121, rand: 150, start: 1, endedFrom: 6 },
];

/** How many once-off gifts each month has, oldest first (December and the end of the tax year are busier). */
const ONCE_OFF = [11, 25, 9, 12, 12, 14, 14, 12, 15, 16, 16, 18];
const AMOUNTS: [number, number][] = [[100, 10], [150, 8], [180, 10], [200, 12], [250, 10], [300, 9], [360, 8], [500, 10], [750, 5], [1000, 6], [1500, 3], [2000, 3], [5000, 1]];
const SOURCES: [string, number][] = [["website", 30], ["share_link", 20], ["whatsapp", 18], ["qr", 14], ["app", 10], ["website_button", 6]];

export type DemoData = {
  now: Date;
  today: string;
  /** The twelve months shown, oldest first, as yyyy-mm. */
  months: string[];
  donors: DemoDonor[];
  gifts: DemoGift[];
  monthly: MonthlyRow[];
  campaigns: DemoCampaign[];
  donor: (id: string) => DemoDonor | undefined;
};

export function demoData(now: Date = new Date()): DemoData {
  const rand = seeded(20261029);
  const today = saDate(now);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1 - (11 - i), 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
  const monthStart = new Date(`${months[11]}-01T00:00:00+02:00`).getTime();
  // A gift is never later than now: one that would land later today moves to just before now (and never before the month began).
  const at = (month: string, day: number, hour: number) => {
    const t = new Date(`${month}-${pad(day)}T${pad(hour)}:${pad(Math.floor(rand() * 60))}:00+02:00`).getTime();
    return new Date(t <= now.getTime() ? t : Math.max(monthStart, now.getTime() - 60_000)).toISOString();
  };
  const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

  const donors: DemoDonor[] = Array.from({ length: DEMO_DONOR_COUNT }, (_, i) => {
    const first = FIRST[i % FIRST.length];
    const last = LAST[Math.floor(i / FIRST.length)];
    return { id: `demo-donor-${i}`, first, last, name: `${first} ${last}`, email: `${first}.${last}.${i}@example.test`.toLowerCase(), wants18a: rand() < 0.55 };
  });

  const campaigns = [
    { id: "demo-c1", title: "Winter food parcels", description: "A full winter parcel, with blankets, for every family on our list.", targetCents: 5_000_000, endsAt: new Date(now.getTime() + 63 * DAY).toISOString(), status: "active" },
    { id: "demo-c2", title: "School shoes", description: "A pair of school shoes for every child in our after-school programme.", targetCents: 2_000_000, endsAt: new Date(now.getTime() + 120 * DAY).toISOString(), status: "active" },
  ];

  const gifts: DemoGift[] = [];
  let n = 0;
  months.forEach((month, mi) => {
    const isNow = mi === 11;
    const lastDay = isNow ? td : daysIn(month);
    // Monthly donations, collected on each donor's day of the month.
    MONTHLY.forEach((m, k) => {
      if (mi < m.start) return;
      if (m.pausedFrom !== undefined && mi >= m.pausedFrom) return;
      if (m.endedFrom !== undefined && mi >= m.endedFrom) return;
      const day = 1 + ((m.donor * 7) % 25);
      if (isNow && (day > td || m.retrying)) return; // not due yet, or declined and being tried again
      const d = donors[m.donor];
      gifts.push({ id: `demo-g${++n}`, donorId: d.id, amountCents: m.rand * 100, paidAt: at(month, day, 9), status: "paid", source: k % 2 ? "app" : "website", campaignId: null, recurringId: `demo-m${k}`, wants18a: d.wants18a, recordedMethod: null });
    });
    // Once-off gifts; this month only so far.
    const count = isNow ? Math.max(1, Math.round((ONCE_OFF[mi] * td) / daysIn(month))) : ONCE_OFF[mi];
    for (let g = 0; g < count; g++) {
      const d = donors[14 + Math.floor(rand() ** 1.6 * (DEMO_DONOR_COUNT - 16))];
      const recorded = rand() < 0.05;
      const roll = rand();
      const campaignId = mi >= 9 && roll < 0.2 ? "demo-c2" : mi >= 7 && roll < 0.45 ? "demo-c1" : null;
      gifts.push({
        id: `demo-g${++n}`,
        donorId: d.id,
        amountCents: pick(rand, AMOUNTS) * 100,
        paidAt: at(month, 1 + Math.floor(rand() * lastDay), 8 + Math.floor(rand() * 12)),
        status: "paid",
        source: recorded ? "recorded" : pick(rand, SOURCES),
        campaignId,
        recurringId: null,
        wants18a: d.wants18a,
        recordedMethod: recorded ? (rand() < 0.7 ? "eft" : "cash") : null,
      });
    }
  });
  // A few gifts that went wrong later, so the Refunded and Charged back views have something in them.
  const onceOff = gifts.filter((g) => !g.recurringId && !g.recordedMethod);
  [onceOff[5], onceOff[40]].forEach((g) => { if (g) g.status = "refunded"; });
  if (onceOff[70]) onceOff[70].status = "charged_back";
  gifts.sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  const paidIn = (id: string) => gifts.filter((g) => g.campaignId === id && g.status === "paid");
  const campaignRows = campaigns.map((c) => ({ ...c, raisedCents: paidIn(c.id).reduce((t, g) => t + g.amountCents, 0), giftCount: paidIn(c.id).length }));

  const monthly: MonthlyRow[] = MONTHLY.map((m, k) => {
    const d = donors[m.donor];
    const own = gifts.filter((g) => g.recurringId === `demo-m${k}`);
    const day = 1 + ((m.donor * 7) % 25);
    const startMonth = months[m.start];
    const next = new Date(Date.UTC(ty, tm - 1 + (day > td || m.retrying ? 0 : 1), day, 7));
    return {
      recurring_id: `demo-m${k}`,
      status: m.endedFrom !== undefined ? "cancelled" : m.pausedFrom !== undefined ? "paused" : "active",
      retrying: Boolean(m.retrying),
      amount_cents: m.rand * 100,
      charge_day: day,
      next_charge_at: m.endedFrom !== undefined || m.pausedFrom !== undefined ? null : next.toISOString(),
      started_at: new Date(`${startMonth}-${pad(day)}T08:00:00+02:00`).toISOString(),
      last_paid_at: own[0]?.paidAt ?? null,
      paid_count: own.length,
      paid_cents: own.reduce((t, g) => t + g.amountCents, 0),
      wants_18a: d.wants18a,
      is_anonymous: false,
      dedication_kind: null,
      dedication_name: null,
      donor_type: "individual",
      display_name: d.name,
      email: d.email,
      phone: null,
      paused_at: m.pausedFrom !== undefined ? new Date(`${months[m.pausedFrom]}-03T10:00:00+02:00`).toISOString() : null,
      ended_at: m.endedFrom !== undefined ? new Date(`${months[m.endedFrom]}-04T10:00:00+02:00`).toISOString() : null,
    };
  });

  const byId = new Map(donors.map((d) => [d.id, d]));
  return { now, today, months, donors, gifts, monthly, campaigns: campaignRows, donor: (id) => byId.get(id) };
}

/** What a donor has given (paid gifts only), in the shape the dashboard's donor helpers expect. */
export function donorFacts(data: DemoData) {
  const out = new Map<string, { donor_id: string; donor_type: string; display_name: string; email: string; phone: null; donation_count: number; total_cents: number; first_paid_at: string; last_paid_at: string; wants_18a: boolean; is_anonymous: boolean }>();
  for (const g of data.gifts) {
    if (g.status !== "paid") continue;
    const d = data.donor(g.donorId)!;
    const row = out.get(d.id) ?? { donor_id: d.id, donor_type: "individual", display_name: d.name, email: d.email, phone: null, donation_count: 0, total_cents: 0, first_paid_at: g.paidAt, last_paid_at: g.paidAt, wants_18a: d.wants18a, is_anonymous: false };
    row.donation_count += 1;
    row.total_cents += g.amountCents;
    if (g.paidAt < row.first_paid_at) row.first_paid_at = g.paidAt;
    if (g.paidAt > row.last_paid_at) row.last_paid_at = g.paidAt;
    out.set(d.id, row);
  }
  return [...out.values()];
}
