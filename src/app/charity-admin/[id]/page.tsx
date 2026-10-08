import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { loadOverview, requireCharityDashboard } from "@/lib/charity/dashboard";
import { formatMonth, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { DashboardNav } from "./dashboard-nav";

export const metadata: Metadata = { title: "Overview" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Stat({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

type ChartMonth = { month: string; paidCents: number; paidCount: number };

/** Paid donations per month for the last 12 months. One series, so no legend. */
function MonthlyChart({ months }: { months: ChartMonth[] }) {
  const max = Math.max(...months.map((m) => m.paidCents));
  return (
    <div>
      {max === 0 ? (
        <p className="text-sm text-muted">No paid donations in the last 12 months yet.</p>
      ) : (
        <div className="flex h-40 items-end gap-0.5 border-b border-border" aria-hidden="true">
          {months.map((m) => {
            const label = `${formatMonth(m.month)}: ${formatRand(m.paidCents)} (${plural(m.paidCount, "donation", "donations")})`;
            return (
              // The whole column is the hover target, not only the bar.
              <div key={m.month} title={label} className="group flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t bg-brand group-hover:opacity-80"
                  style={{ height: m.paidCents > 0 ? `max(2px, ${(m.paidCents / max) * 100}%)` : 0 }}
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
        <span>{formatMonth(months[0].month)}</span>
        <span>{formatMonth(months[months.length - 1].month)}</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-xs text-muted">
            <tr><th className="py-1 font-medium">Month</th><th className="py-1 text-right font-medium">Donations</th><th className="py-1 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {months.map((m) => (
              <tr key={m.month} className="border-t border-border">
                <td className="py-1">{formatMonth(m.month)}</td>
                <td className="py-1 text-right">{m.paidCount}</td>
                <td className="py-1 text-right">{formatRand(m.paidCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default async function OverviewPage({ params }: PageProps<"/charity-admin/[id]">) {
  const { id } = await params;
  const { charity } = await requireCharityDashboard(id, `/charity-admin/${id}`);
  const o = await loadOverview(id);
  const active = o.recurring.active ?? { count: 0, cents: 0 };
  const stoppedCount = (o.recurring.paused?.count ?? 0) + (o.recurring.cancelled?.count ?? 0) + (o.recurring.failed?.count ?? 0);
  const donations = `/charity-admin/${id}/donations`;

  return (
    <div className="space-y-4">
      <DashboardNav charity={charity} current="overview" />

      <p className="text-xs text-muted">
        Amounts are the donations themselves, without the processing fee the donor paid. Only paid donations are counted.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="This month" value={formatRand(o.month.paidCents)} note={plural(o.month.paidCount, "donation", "donations")} />
        <Stat
          label={`Tax year ${o.taxYear} so far`}
          value={formatRand(o.year.paidCents)}
          note={`${plural(o.year.paidCount, "donation", "donations")}, ${o.year.wants18aCount} asked for an 18A receipt`}
        />
        <Stat label={`Donors in tax year ${o.taxYear}`} value={String(o.year.donors)} note="Each donor counted once" />
        <Stat
          label="Active monthly donations"
          value={String(active.count)}
          note={active.count > 0 ? `${formatRand(active.cents)} a month in total` : stoppedCount > 0 ? `${stoppedCount} paused, cancelled or failed` : undefined}
        />
      </div>

      {o.pendingCount > 0 || o.failedThisMonthCount > 0 || o.year.reversedCount > 0 ? (
        <Card title="Needs a look">
          <ul className="space-y-2 text-sm">
            {o.pendingCount > 0 ? (
              <li>
                <Link href={`${donations}?status=pending`} className="text-brand underline">{plural(o.pendingCount, "donation is", "donations are")} pending</Link>
                <span className="text-muted">: the donor started paying and we haven&apos;t had confirmation yet.</span>
              </li>
            ) : null}
            {o.failedThisMonthCount > 0 ? (
              <li>
                <Link href={`${donations}?status=failed`} className="text-brand underline">{plural(o.failedThisMonthCount, "payment", "payments")} failed this month</Link>
                <span className="text-muted">. Nothing was charged.</span>
              </li>
            ) : null}
            {o.year.reversedCount > 0 ? (
              <li>
                <Link href={`${donations}?status=reversed`} className="text-brand underline">
                  {plural(o.year.reversedCount, "donation", "donations")} refunded or charged back
                </Link>
                <span className="text-muted"> in tax year {o.taxYear}, {formatRand(o.year.reversedCents)} in total. Not included in the figures above.</span>
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      <Card title="Paid donations by month">
        <MonthlyChart months={o.chart} />
      </Card>

      <p className="text-xs text-muted">{taxYearLabel(o.taxYear)}. Months and dates are in South African time.</p>
    </div>
  );
}
