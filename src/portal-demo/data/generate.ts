/**
 * Builds one demo charity's 12 months of activity from a fixed seed, so every load gives
 * the same data and every screen reads from the same rows. Totals on every screen are
 * computed from these rows (see `selectors.ts`), never typed in separately.
 */
import { CHARITY_SPECS, type CharitySpec } from "./charities";
import { DEMO_PLACEHOLDER_FEE_PPM, DEMO_START, DEMO_TODAY, PLATFORM_FEE_CENTS, type FeeModel } from "./demo-config";
import { addDays, daysBetween, monthOf, weekday } from "./day";
import type { Campaign, DemoDataset, Donation, Donor, Payout, RecurringPlan } from "./types";

/** Small, fast, seeded random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;

function pick<T>(r: Rand, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)];
}

function weighted<T>(r: Rand, items: readonly [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    if ((x -= w) < 0) return v;
  }
  return items[items.length - 1][0];
}

/** Fee in cents on an amount, rounded half up, integer maths only. */
export function feeFor(amountCents: number, ppm: number): number {
  return Number((BigInt(amountCents) * BigInt(ppm) + 500_000n) / 1_000_000n);
}

const FIRST = ["Thandi", "Sipho", "Lerato", "Johan", "Anika", "David", "Rachel", "Naledi", "Pieter", "Zanele", "Mohammed", "Aisha", "Priya", "Ravi", "Sarah", "Michael", "Leah", "Daniel", "Nomsa", "Kagiso", "Bongani", "Lindiwe", "Chantelle", "Ruan", "Fatima", "Yusuf", "Esther", "Ari", "Talia", "Noah", "Megan", "Grant", "Kerry", "Tshepo", "Mpho", "Ayanda", "Zoe", "Ethan", "Hannah", "Liam", "Refilwe", "Shira", "Jacques", "Nadia", "Kabelo", "Tamar", "Gareth", "Precious", "Imran", "Elize"];
const LAST = ["Mokoena", "Naidoo", "van der Merwe", "Botha", "Cohen", "Levy", "Dlamini", "Nkosi", "Pillay", "Govender", "Smith", "Jacobs", "Adams", "Khumalo", "Mahlangu", "Steyn", "Pretorius", "Abrahams", "Friedman", "Sacks", "Patel", "Moodley", "Ndlovu", "Venter", "du Plessis", "Meyer", "Hendricks", "Sithole", "Molefe", "Goldberg", "Kruger", "Joseph", "Maseko", "Isaacs", "Chetty", "Fourie", "Shapiro", "Zulu", "Williams", "Bester"];
const COMPANIES = ["Bluegum Joinery", "Marula Accounting", "Sandvlei Pharmacy", "Protea Print Works", "Highveld Office Supplies", "Karoo Kitchen Co", "Baobab Freight", "Fynbos Design Studio", "Jacaranda Dental", "Umoya Engineering"];
const FAILURES = ["Card declined by the bank", "Insufficient funds", "Card expired", "Authentication not completed"];

/** A moment on a Johannesburg calendar day, as a UTC ISO string (Johannesburg is UTC+2, no daylight saving). */
function at(day: string, r: Rand): string {
  const hour = 7 + Math.floor(r() * 14); // 07:00 to 20:59 local
  const minute = Math.floor(r() * 60);
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCHours(hour - 2, minute, Math.floor(r() * 60));
  return d.toISOString();
}

/** The Johannesburg calendar day of a UTC ISO moment. */
export function localDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

/** Settlement: the next business day after the donation (placeholder, ignores public holidays). */
function settlementDay(day: string): string {
  let d = addDays(day, 1);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
  return d;
}

/** Monday of the week a day falls in. */
function mondayOf(day: string): string {
  const wd = weekday(day); // 0 Sunday .. 6 Saturday
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

function campaignEffectiveEnd(c: CharitySpec["campaigns"][number]): string {
  if (c.status === "paused") return "2026-09-15";
  return c.endDate ?? DEMO_TODAY;
}

export function generateDataset(charityId: string, feeModel: FeeModel = "charity"): DemoDataset {
  const spec = CHARITY_SPECS.find((s) => s.charity.id === charityId);
  if (!spec) throw new Error(`Unknown demo charity: ${charityId}`);
  const r = rng(spec.seed);
  const cid = spec.charity.id;
  const feePpm = feeModel === "charity" ? DEMO_PLACEHOLDER_FEE_PPM : 0;

  const donors: Donor[] = [];
  const newDonor = (): Donor => {
    const company = r() < 0.04;
    const first = company ? pick(r, COMPANIES) : pick(r, FIRST);
    const last = company ? "(Pty) Ltd" : pick(r, LAST);
    const n = donors.length + 1;
    const handle = company ? first.toLowerCase().replace(/[^a-z]+/g, "") : `${first}.${last}`.toLowerCase().replace(/[^a-z.]+/g, "");
    const donor: Donor = {
      id: `${cid}-d${n}`,
      charityId: cid,
      firstName: first,
      lastName: last,
      email: `${handle}${n}@example.org`,
      city: pick(r, spec.cities),
      type: company ? "company" : "individual",
      prefersAnonymous: !company && r() < 0.07,
    };
    donors.push(donor);
    return donor;
  };
  /** Mostly earlier donors: a loyal core gives again and again. */
  const existingDonor = (): Donor => donors[Math.floor(donors.length * r() * r())];

  const totalDays = daysBetween(DEMO_START, DEMO_TODAY) + 1;
  const donations: Donation[] = [];
  let seq = 0;
  const ref = () => `GZ-${spec.refCode}-${String(++seq + 1000).padStart(6, "0")}`;

  const campaignFor = (day: string): string | null => {
    const live = spec.campaigns.filter((c) => c.weight > 0 && c.startDate <= day && day <= campaignEffectiveEnd(c));
    const options: [string | null, number][] = [[null, 1], ...live.map((c) => [c.id, c.weight] as [string, number])];
    return weighted(r, options);
  };

  const makeDonation = (donor: Donor, day: string, amountCents: number, kind: Donation["kind"], campaignId: string | null, recurringId: string | null): Donation => {
    const donatedAt = at(day, r);
    const ageDays = daysBetween(day, DEMO_TODAY);
    let status: Donation["status"] = "paid";
    const roll = r();
    if (ageDays <= 1 && roll < 0.1) status = "pending";
    else if (roll < (kind === "monthly" ? 0.05 : 0.03)) status = "failed";
    else if (roll > 0.985 && ageDays > 3) status = "refunded";

    let refundedAt: string | null = null;
    if (status === "refunded") {
      const refundDay = addDays(day, 1 + Math.floor(r() * 12));
      if (refundDay <= DEMO_TODAY) refundedAt = at(refundDay, r);
      else status = "paid";
    }
    const settles = status === "paid" || status === "refunded";
    const settleDay = settles ? settlementDay(day) : null;
    return {
      id: `${cid}-x${seq + 1}`,
      ref: ref(),
      charityId: cid,
      donorId: donor.id,
      campaignId,
      recurringId,
      kind,
      status,
      amountCents,
      processingFeeCents: settles ? feeFor(amountCents, feePpm) : 0,
      platformFeeCents: PLATFORM_FEE_CENTS,
      donatedAt,
      settledAt: settleDay && settleDay <= DEMO_TODAY ? `${settleDay}T08:00:00.000Z` : null,
      payoutId: null,
      refundedAt,
      wants18a: spec.charity.s18a && r() < 0.55,
      anonymous: donor.prefersAnonymous,
      channel: r() < 0.62 ? "app" : "website",
      cardLast4: String(1000 + Math.floor(r() * 9000)),
      failureReason: status === "failed" ? pick(r, FAILURES) : null,
    };
  };

  // Once-off donations, day by day.
  for (let i = 0; i < totalDays; i++) {
    const day = addDays(DEMO_START, i);
    const month = monthOf(day);
    const growth = 0.82 + (0.36 * i) / totalDays;
    const weekdayLift = weekday(day) === 5 ? 1.25 : weekday(day) === 6 ? 0.7 : 1;
    const expected = (spec.monthlyVolume / 30.4) * spec.seasonality[month - 1] * growth * weekdayLift;
    let count = Math.floor(expected);
    if (r() < expected - count) count++;
    for (let k = 0; k < count; k++) {
      const donor = donors.length < 5 || r() < spec.newDonorChance ? newDonor() : existingDonor();
      const amount = weighted(r, spec.amounts) * 100;
      donations.push(makeDonation(donor, day, amount, "once", campaignFor(day), null));
    }
  }

  // Monthly donations: sign-ups spread over the year, then one charge a month.
  const recurring: RecurringPlan[] = [];
  for (let p = 0; p < spec.recurringStarts; p++) {
    const startDay = addDays(DEMO_START, Math.floor(r() * (totalDays - 3)));
    const donor = r() < 0.5 && donors.length > 10 ? existingDonor() : newDonor();
    const amountCents = weighted(r, spec.recurringAmounts) * 100;
    const campaignId = r() < 0.75 ? null : campaignFor(startDay);
    let status: RecurringPlan["status"] = "active";
    let cancelledAt: string | null = null;
    let pausedAt: string | null = null;
    let lastDay = DEMO_TODAY;
    const roll = r();
    if (roll < 0.17) {
      const stop = addDays(startDay, 20 + Math.floor(r() * 300));
      if (stop < DEMO_TODAY) {
        status = "cancelled";
        cancelledAt = at(stop, r);
        lastDay = stop;
      }
    } else if (roll < 0.23) {
      const stop = addDays(startDay, 20 + Math.floor(r() * 200));
      if (stop < DEMO_TODAY) {
        status = "paused";
        pausedAt = at(stop, r);
        lastDay = stop;
      }
    }
    const dayOfMonth = Number(startDay.slice(8, 10)) > 28 ? 28 : Number(startDay.slice(8, 10));
    const plan: RecurringPlan = { id: `${cid}-r${p + 1}`, charityId: cid, donorId: donor.id, campaignId, amountCents, dayOfMonth, startedAt: at(startDay, r), status, cancelledAt, pausedAt };
    recurring.push(plan);
    let chargeDay = startDay;
    while (chargeDay <= lastDay) {
      donations.push(makeDonation(donor, chargeDay, amountCents, "monthly", campaignId, plan.id));
      const [y, m] = chargeDay.split("-").map(Number);
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      chargeDay = `${ny}-${String(nm).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    }
  }

  donations.sort((a, b) => (a.donatedAt < b.donatedAt ? 1 : -1));

  // Campaigns: goals set from what each one raised, rounded to a tidy figure.
  const raised = new Map<string, number>();
  for (const d of donations) if (d.status === "paid" && d.campaignId) raised.set(d.campaignId, (raised.get(d.campaignId) ?? 0) + d.amountCents);
  const campaigns: Campaign[] = spec.campaigns.map((c) => {
    const got = raised.get(c.id) ?? 0;
    const step = 500_000; // R5 000
    const goal = c.draftGoalCents ?? Math.max(step, Math.round(got / c.fundedRatio / step) * step);
    return {
      id: c.id,
      charityId: cid,
      name: c.name,
      slug: c.id.replace(/^[a-z]+-/, ""),
      summary: c.summary,
      goalCents: goal,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      createdAt: `${addDays(c.startDate, -14)}T09:00:00.000Z`,
    };
  });

  const payouts = buildPayouts(cid, donations);
  return { charity: spec.charity, campaigns, donors, donations, recurring, payouts, team: spec.team };
}

/**
 * Weekly payouts from settled donations. Each payout carries the donations settled
 * Monday to Sunday, minus refunds made in that week. Sets `payoutId` on each donation.
 */
function buildPayouts(cid: string, donations: Donation[]): Payout[] {
  const weeks = new Map<string, Payout>();
  const thisMonday = mondayOf(DEMO_TODAY);
  const weekFor = (monday: string): Payout | null => {
    if (monday >= thisMonday) return null; // this week's settlements are still pending
    let p = weeks.get(monday);
    if (!p) {
      const sent = addDays(monday, 7);
      const arrives = addDays(monday, 10);
      p = {
        id: `${cid}-p${monday}`,
        ref: `PO-${monday.replace(/-/g, "")}`,
        charityId: cid,
        periodStart: monday,
        periodEnd: addDays(monday, 6),
        sentDate: sent,
        payoutDate: arrives,
        status: arrives <= DEMO_TODAY ? "paid" : "in_transit",
        grossCents: 0,
        feesCents: 0,
        refundsCents: 0,
        netCents: 0,
        donationCount: 0,
      };
      weeks.set(monday, p);
    }
    return p;
  };
  for (const d of donations) {
    if (!d.settledAt) continue;
    const p = weekFor(mondayOf(d.settledAt.slice(0, 10)));
    if (p) {
      d.payoutId = p.id;
      p.grossCents += d.amountCents;
      p.feesCents += d.processingFeeCents + d.platformFeeCents;
      p.donationCount++;
    }
    if (d.status === "refunded" && d.refundedAt) {
      const rp = weekFor(mondayOf(localDay(d.refundedAt)));
      if (rp) rp.refundsCents += d.amountCents;
    }
  }
  const list = [...weeks.values()];
  for (const p of list) p.netCents = p.grossCents - p.feesCents - p.refundsCents;
  return list.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
}
