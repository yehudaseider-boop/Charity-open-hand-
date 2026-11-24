import { lastMonth, thisMonth, thisTaxYear, type MonthlyRow } from "@/lib/charity/dashboard";
import { formatDate } from "@/lib/dates";
import type { DonorSummary, MonthlyState } from "./tools";

/**
 * What Givy's name tools know about each donor beyond their totals (24/11/2026), worked out the same way for the live
 * charity (./live-source.ts) and the public demo (./demo-source.ts). Pure: no database, no request.
 */

/** Whether a first gift (ISO) fell this month, last month or this tax year (Johannesburg time). */
export function newFlags(now: Date) {
  const m = thisMonth(now);
  const l = lastMonth(now);
  const t = thisTaxYear(now);
  const within = (at: string, p: { from: string; to: string }) => Date.parse(at) >= Date.parse(p.from) && Date.parse(at) < Date.parse(p.to);
  return (first: string | null | undefined) =>
    first ? { this_month: within(first, m), last_month: within(first, l), this_tax_year: within(first, t) } : { this_month: false, last_month: false, this_tax_year: false };
}

/**
 * Each donor's monthly donation now, as the Donors page's badges show it: running if any is active, else paused, else
 * stopped (ended, or the card was declined every time) with when the last one stopped, else none.
 */
export function monthlyStates(
  gifts: { donor_id: string; recurring_id: string | null }[],
  monthly: Pick<MonthlyRow, "recurring_id" | "status" | "amount_cents" | "ended_at">[],
): Map<string, { state: MonthlyState; perMonthCents: number; stopped: DonorSummary["stopped"] }> {
  const byId = new Map(monthly.map((m) => [m.recurring_id, m]));
  const mine = new Map<string, Set<string>>();
  for (const g of gifts) if (g.recurring_id) mine.set(g.donor_id, (mine.get(g.donor_id) ?? new Set()).add(g.recurring_id));
  const out = new Map<string, { state: MonthlyState; perMonthCents: number; stopped: DonorSummary["stopped"] }>();
  for (const [donor, ids] of mine) {
    const rows = [...ids].map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    const active = rows.filter((r) => r.status === "active");
    const ended = rows.filter((r) => r.status === "cancelled" || r.status === "failed").sort((a, b) => String(b.ended_at ?? "").localeCompare(String(a.ended_at ?? "")));
    if (active.length) out.set(donor, { state: "running", perMonthCents: active.reduce((t, r) => t + Number(r.amount_cents), 0), stopped: null });
    else if (rows.some((r) => r.status === "paused")) out.set(donor, { state: "paused", perMonthCents: 0, stopped: null });
    else if (ended.length) {
      const last = ended[0];
      out.set(donor, { state: "stopped", perMonthCents: 0, stopped: { on: last.ended_at ? formatDate(last.ended_at) : null, how: last.status === "failed" ? "card declined" : "ended", at: last.ended_at } });
    }
  }
  return out;
}
