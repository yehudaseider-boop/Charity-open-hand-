/**
 * Made-up gifts for the annual report checks (24/11/2026), shared by charity-report-summary.test.ts (the page's sums
 * against a stand-in for the database function) and report-summary-db.test.ts (the real function). A fixed seed, so
 * every run makes the same gifts: paid, refunded and charged back; part refunds; tax years that differ from the
 * payment date or are missing; gifts with no payment date; monthly and campaign gifts; s18A requests; the
 * end-of-February midnight edges in Johannesburg time. Paid gifts always have a payment date and a tax year, as the
 * database requires (paid_has_tax_year).
 */
import type { ReportGift } from "@/lib/charity/annual-report";
import { taxYearFor } from "@/lib/dates";

let seed = 7;
export const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const hex = (n: number) => n.toString(16).padStart(12, "0");
export const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Donors are "d0", "d1", ...; monthly donations "r1" and "r2"; campaigns "c1" to "c4". Ids are UUIDs, in id order. */
export function madeUpGifts(count: number, donors: number): ReportGift[] {
  const edges = ["2026-02-28T21:59:59Z", "2026-02-28T22:00:00Z", "2025-02-28T21:30:00Z", "2024-02-29T22:00:01Z", "2026-03-31T22:30:00Z", "2026-11-30T22:00:00Z"];
  return Array.from({ length: count }, (_, i) => {
    const status = pick(["paid", "paid", "paid", "paid", "refunded", "charged_back"]);
    const amount = pick([1_000, 5_000, 5_000, 10_000, 25_000, 123_457]);
    const paidAt = rnd() < 0.1 ? pick(edges) : new Date(Date.UTC(2022, 0, 1) + rnd() * (Date.UTC(2026, 10, 24) - Date.UTC(2022, 0, 1))).toISOString();
    const hasPaid = status === "paid" || rnd() < 0.8;
    return {
      id: `00000000-0000-4000-8000-${hex(Math.floor(rnd() * 1e12))}${i}`.slice(0, 36),
      donor_id: `d${Math.floor(rnd() * donors)}`,
      status,
      amount_cents: amount,
      refunded_cents: status === "paid" && rnd() < 0.15 ? pick([amount, Math.floor(amount / 3), 1]) : 0,
      paid_at: hasPaid ? paidAt : null,
      tax_year: status === "paid" ? (rnd() < 0.05 ? taxYearFor(paidAt) + pick([-1, 1]) : taxYearFor(paidAt)) : rnd() < 0.5 ? null : taxYearFor(paidAt),
      recurring_id: rnd() < 0.3 ? pick(["r1", "r2"]) : null,
      campaign_id: rnd() < 0.4 ? pick(["c1", "c2", "c3", "c4"]) : null,
      wants_18a: rnd() < 0.4,
    };
  }).sort(byId); // The page read them in id order (charity_donations ... order by id).
}
