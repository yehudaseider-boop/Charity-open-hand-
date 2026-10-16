/**
 * Plain insights for a charity's overview, worked out from what we already store (16/10/2026).
 * From Givelify's "giving styles" and Pushpay's donor stages, kept to simple rules a treasurer can
 * check by hand. Pure functions: no database, no clock (the caller passes "now").
 */
import type { MonthlyRow } from "./dashboard";

const DAY = 86_400_000;

/** A first gift this recent makes someone a new donor (Givelify keeps donors "new" for four weeks). */
export const NEW_DONOR_DAYS = 30;
/** No gift for this long makes someone lapsed. Our own choice: Pushpay uses 120 days, Givelify 12 months. */
export const LAPSED_DAYS = 180;
/** How far back "recently ended" and "recently paused" monthly donations look. */
export const RECENT_DAYS = 30;

export type DonorGroup = "new" | "repeat" | "once" | "lapsed";

export const donorGroups: { key: DonorGroup; label: string; hint: string }[] = [
  { key: "new", label: "New", hint: `First gift in the last ${NEW_DONOR_DAYS} days` },
  { key: "repeat", label: "Coming back", hint: "Gave more than once, and in the last 6 months" },
  { key: "once", label: "Gave once", hint: "One gift, in the last 6 months" },
  { key: "lapsed", label: "Lapsed", hint: "Nothing in the last 6 months" },
];

export function isDonorGroup(s: unknown): s is DonorGroup {
  return typeof s === "string" && donorGroups.some((g) => g.key === s);
}

type DonorFacts = { donation_count: number; first_paid_at: string; last_paid_at: string };

/** Each donor is in exactly one group. */
export function donorGroup(d: DonorFacts, now: Date): DonorGroup {
  const t = now.getTime();
  if (t - new Date(d.last_paid_at).getTime() > LAPSED_DAYS * DAY) return "lapsed";
  if (t - new Date(d.first_paid_at).getTime() <= NEW_DONOR_DAYS * DAY) return "new";
  return d.donation_count >= 2 ? "repeat" : "once";
}

export function countDonorGroups(donors: DonorFacts[], now: Date): Record<DonorGroup, number> {
  const out: Record<DonorGroup, number> = { new: 0, repeat: 0, once: 0, lapsed: 0 };
  for (const d of donors) out[donorGroup(d, now)] += 1;
  return out;
}

/** The donors who have given the most in total, highest first (ties: most gifts, then most recent). */
export function topDonors<T extends DonorFacts & { total_cents: number }>(donors: T[], n = 5): T[] {
  return [...donors]
    .sort((a, b) => b.total_cents - a.total_cents || b.donation_count - a.donation_count || b.last_paid_at.localeCompare(a.last_paid_at))
    .slice(0, n);
}

export type MonthlyAttention = { retrying: number; pausedRecently: number; endedRecently: number; endedRecentlyCents: number };

/** Monthly donations that need a human: declined and being retried, or paused or ended in the last 30 days. */
export function monthlyAttention(rows: Pick<MonthlyRow, "status" | "retrying" | "paused_at" | "ended_at" | "amount_cents">[], now: Date): MonthlyAttention {
  const recent = (iso: string | null) => Boolean(iso) && now.getTime() - new Date(iso as string).getTime() <= RECENT_DAYS * DAY;
  const ended = rows.filter((r) => (r.status === "failed" || r.status === "cancelled") && recent(r.ended_at));
  return {
    retrying: rows.filter((r) => r.status === "active" && r.retrying).length,
    pausedRecently: rows.filter((r) => r.status === "paused" && recent(r.paused_at)).length,
    endedRecently: ended.length,
    endedRecentlyCents: ended.reduce((t, r) => t + Number(r.amount_cents), 0),
  };
}

/** A campaign whose last moment is within the next seven days. */
export function endsWithinAWeek(endsAt: string | null, now: Date): boolean {
  if (!endsAt) return false;
  const left = new Date(endsAt).getTime() - now.getTime();
  return left >= 0 && left <= 7 * DAY;
}

export type MonthTotal = { month: string; donationCount: number; amountCents: number; monthlyCents: number };

/**
 * The last `n` Johannesburg calendar months, oldest first, with months that had no gifts filled in
 * as zero, so the bars line up with the calendar. `todaySa` is today's date (yyyy-mm-dd) in Johannesburg.
 */
export function lastMonths(rows: MonthTotal[], todaySa: string, n = 12): MonthTotal[] {
  const byMonth = new Map(rows.map((r) => [r.month.slice(0, 7), r]));
  let [y, m] = todaySa.split("-").map(Number);
  const out: MonthTotal[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const r = byMonth.get(key);
    out.push({ month: `${key}-01`, donationCount: r?.donationCount ?? 0, amountCents: r?.amountCents ?? 0, monthlyCents: r?.monthlyCents ?? 0 });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out.reverse();
}
