import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { requireViewer } from "@/lib/auth";
import { chargeDayLabel, ERASED_DONOR, isErasedEmail, monthlyState, monthlyStateLabel, monthlySummary, safeSearch, shownEmail, type MonthlyState } from "@/lib/charity/dashboard";
import { loadMonthlyDonations } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { dedicationFrom, dedicationLine } from "@/lib/donations/dedication";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Monthly donations" };

const PAGE = 25;
const filters = [
  { key: "", label: "All" },
  { key: "running", label: "Running" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Stopped or cancelled" },
] as const;
type Filter = (typeof filters)[number]["key"];

const matches = (f: Filter, s: MonthlyState) =>
  f === "" || (f === "running" && (s === "running" || s === "retrying")) || (f === "paused" && s === "paused") || (f === "ended" && (s === "stopped" || s === "cancelled"));

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function MonthlyPage({ params, searchParams }: PageProps<"/charity-admin/[id]/monthly">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/monthly`);
  await loadCharityForManager(id);
  const sp = await searchParams;
  const q = safeSearch(typeof sp.q === "string" ? sp.q : "");
  const show: Filter = filters.some((f) => f.key === sp.show) ? (sp.show as Filter) : "";
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const all = await loadMonthlyDonations(id);
  const summary = monthlySummary(all);
  const needle = q.toLowerCase();
  const rows = all.filter(
    (r) => matches(show, monthlyState(r)) && (!needle || (r.display_name ?? "").toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const base = `/charity-admin/${id}/monthly`;
  const href = (o: { show?: Filter; page?: number }) => {
    const s = o.show ?? show;
    const p = o.page ?? 1;
    const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { show: s } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-indigo">Monthly donations</h1>
      <p className="text-sm text-muted">
        Donors who give the same amount every month. Givezy collects it on the day they chose. Donors pause, restart or cancel it themselves; you can&apos;t change it from here.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-xs text-muted">Running</p>
          <p className="mt-1 text-xl font-semibold">{formatRand(summary.runningCentsPerMonth)}</p>
          <p className="mt-0.5 text-xs text-muted">a month from {plural(summary.runningCount, "donor")}</p>
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-xs text-muted">Paused or ended</p>
          <p className="mt-1 text-xl font-semibold">{summary.pausedCount + summary.endedCount}</p>
          <p className="mt-0.5 text-xs text-muted">{summary.pausedCount} paused, {summary.endedCount} ended</p>
        </div>
      </div>
      <p className="text-xs text-muted">Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included.</p>

      <nav aria-label="Show" className="flex flex-wrap gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f.key || "all"}
            href={href({ show: f.key })}
            aria-current={show === f.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${show === f.key ? "border-brand bg-brand-soft text-indigo" : "border-border"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <form action={base} className="flex gap-2">
        {show ? <input type="hidden" name="show" value={show} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search by donor name or email"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          {all.length === 0
            ? "No monthly donations yet. One appears here once its first payment has gone through."
            : "No monthly donations match."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const state = monthlyState(r);
            const tag = monthlyStateLabel[state];
            const dedication = dedicationFrom(r.dedication_kind, r.dedication_name);
            const day = chargeDayLabel(r.charge_day);
            return (
              <li key={r.recurring_id} className="rounded-card border border-border bg-surface p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium" dir="auto">{isErasedEmail(r.email) || !r.display_name ? ERASED_DONOR : r.display_name}</p>
                    {shownEmail(r.email) ? <p className="break-all text-muted">{r.email}</p> : null}
                    {r.phone ? <p className="text-muted">{r.phone}</p> : null}
                  </div>
                  <p className="shrink-0 text-right font-semibold">
                    {formatRand(r.amount_cents)}
                    <span className="block text-xs font-normal text-muted">a month</span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={tag.tone}>{tag.label}</Badge>
                  {r.wants_18a ? <Badge tone="brand">s18A requested</Badge> : null}
                  {r.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                </div>
                {dedication ? <p className="mt-2" dir="auto">{dedicationLine(dedication)}</p> : null}
                <ul className="mt-2 space-y-0.5 text-muted">
                  <li>Since {formatDate(r.started_at)}: {plural(r.paid_count, "payment")}, {formatRand(r.paid_cents)} in total</li>
                  {state === "running" || state === "retrying" ? (
                    <li>
                      {r.next_charge_at ? `Next on ${formatDate(r.next_charge_at)}` : "Next date not set yet"}
                      {day ? `, collected on ${day}` : ""}
                    </li>
                  ) : null}
                  {state === "paused" && r.paused_at ? <li>Paused on {formatDate(r.paused_at)}</li> : null}
                  {(state === "stopped" || state === "cancelled") && r.ended_at ? <li>Ended on {formatDate(r.ended_at)}</li> : null}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className="text-brand underline">← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className="text-brand underline">Next →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
