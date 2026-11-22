import "server-only";
import { DEMO_BASE, demoOverview, monthOf, saDay } from "@/app/demo/dashboard/sample";
import { demoData } from "@/app/demo/dashboard/data";
import { monthlySummary } from "@/lib/charity/dashboard";
import { formatDate, taxYearFor, taxYearLabel, taxYearRange } from "@/lib/dates";
import { monthName } from "./live-source";
import { linkTarget } from "./prompt";
import type { HelperSource, PeriodKey } from "./tools";

/**
 * The dashboard helper's facts for the public demo (22/11/2026): the same made-up charity, gifts and donors the demo
 * dashboard shows (src/app/demo/dashboard), worked out the same way, so the helper's answers match the screen.
 * Nothing real is read.
 */
export function demoSource(now: Date = new Date()): HelperSource {
  const data = demoData(now);
  const ov = demoOverview(now, data) as unknown as {
    month: Totals; prev: Totals; year: Totals; all: Totals;
    start: { label: string; done: boolean; href: string | null; can: boolean; who: string | null; optional?: boolean }[];
  };
  type Totals = { paid_count: number; paid_cents: number; donor_count: number; receipt_requested_cents: number; refunded_count: number; refunded_cents: number; charged_back_count: number; pending_count: number; failed_count: number };
  const paid = data.gifts.filter((g) => g.status === "paid");
  const nameOf = (id: string) => data.donor(id)?.name ?? "Unknown";

  return {
    async totals(key: PeriodKey) {
      const pick = { this_month: ov.month, last_month: ov.prev, this_tax_year: ov.year, all_time: ov.all }[key];
      const label = {
        this_month: `This month (${monthName(`${data.months[11]}-01`)})`,
        last_month: `Last month (${monthName(`${data.months[10]}-01`)})`,
        this_tax_year: taxYearLabel(taxYearFor(now)),
        all_time: "Since the charity joined Givezy",
      }[key];
      return {
        label,
        gifts: pick.paid_count,
        raisedCents: pick.paid_cents,
        donors: pick.donor_count,
        s18aRequestedCents: pick.receipt_requested_cents,
        refunded: pick.refunded_count,
        refundedCents: pick.refunded_cents,
        chargedBack: pick.charged_back_count,
        pending: pick.pending_count,
        failed: pick.failed_count,
      };
    },

    async byMonth() {
      return data.months.map((m) => {
        const gs = paid.filter((g) => monthOf(g.paidAt) === m);
        return { month: monthName(`${m}-01`), gifts: gs.length, raisedCents: gs.reduce((t, g) => t + g.amountCents, 0), monthlyCents: gs.filter((g) => g.recurringId).reduce((t, g) => t + g.amountCents, 0) };
      });
    },

    async monthly() {
      const s = monthlySummary(data.monthly);
      const next = data.monthly
        .filter((r) => r.status === "active" && r.next_charge_at)
        .sort((a, b) => String(a.next_charge_at).localeCompare(String(b.next_charge_at)))
        .slice(0, 5)
        .map((r) => ({ day: formatDate(r.next_charge_at as string), amountCents: Number(r.amount_cents) }));
      return { running: s.runningCount, perMonthCents: s.runningCentsPerMonth, retrying: data.monthly.filter((r) => r.status === "active" && r.retrying).length, paused: s.pausedCount, ended: s.endedCount, nextCharges: next };
    },

    async setup() {
      return {
        status: "Approved",
        application: null,
        gettingStarted: ov.start.map((i) => ({
          label: i.optional ? `${i.label} (optional)` : i.label,
          done: i.done,
          page: i.href?.startsWith(DEMO_BASE) ? linkTarget(`/charity-admin/[id]${i.href.slice(DEMO_BASE.length)}`) : null,
          who: i.can ? null : i.who,
        })),
      };
    },

    async receipts() {
      // As the demo's receipts page shows it: this tax year's draft list, nothing issued yet.
      const ty = taxYearFor(now);
      const { start, end } = taxYearRange(ty);
      const asked = paid.filter((g) => g.wants18a && saDay(g.paidAt) >= start && saDay(g.paidAt) <= end);
      return [{ taxYear: ty, label: taxYearLabel(ty), giftsWanting: asked.length, onIssued: 0, wantingCents: asked.reduce((t, g) => t + g.amountCents, 0) }];
    },

    async recentGifts(limit, withNames) {
      return data.gifts.slice(0, limit).map((g) => ({
        date: formatDate(g.paidAt),
        amountCents: g.amountCents,
        status: g.status === "charged_back" ? "charged back" : g.status,
        donor: withNames ? nameOf(g.donorId) : null,
        monthly: Boolean(g.recurringId),
        anonymous: false,
      }));
    },

    async donors() {
      const by = new Map<string, { gifts: number; totalCents: number; first: string; last: string; monthly: boolean }>();
      for (const g of paid) {
        const d = by.get(g.donorId) ?? { gifts: 0, totalCents: 0, first: g.paidAt, last: g.paidAt, monthly: false };
        d.gifts += 1;
        d.totalCents += g.amountCents;
        if (g.paidAt < d.first) d.first = g.paidAt;
        if (g.paidAt > d.last) d.last = g.paidAt;
        if (g.recurringId) d.monthly = true;
        by.set(g.donorId, d);
      }
      return [...by.entries()]
        .sort((a, b) => b[1].totalCents - a[1].totalCents || b[1].last.localeCompare(a[1].last))
        .map(([id, d]) => ({ name: nameOf(id), gifts: d.gifts, totalCents: d.totalCents, firstGift: formatDate(d.first), lastGift: formatDate(d.last), monthly: d.monthly }));
    },
  };
}
