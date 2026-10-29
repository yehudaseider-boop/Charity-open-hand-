import { HebrewAware } from "@/components/hebrew-aware";
import type { Metadata } from "next";
import Link from "next/link";
import { NoMatch } from "@/components/no-match";
import { Badge } from "@/components/badge";
import { blueAction, field, MiniStat, PageHeader, secondaryAction, Tabs } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { chargeDayLabel, ERASED_DONOR, isErasedEmail, monthlyState, monthlyStateLabel, monthlySummary, safeSearch, shownEmail, type MonthlyState } from "@/lib/charity/dashboard";
import { loadMonthlyDonations } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { dedicationFrom, dedicationLine, isHebrew } from "@/lib/donations/dedication";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { MonthlyTrend } from "../monthly-trend";

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
    <div className="space-y-5">
      <PageHeader
        title="Monthly donations"
        intro={<>Donors who give the same amount every month. Givezy collects it on the day they chose. Donors pause, restart or cancel it themselves; you can&apos;t change it from here.</>}
      />

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <MiniStat strong label="Running" value={formatRand(summary.runningCentsPerMonth)} note={`a month from ${plural(summary.runningCount, "donor")}`} />
        <MiniStat label="Paused or ended" value={summary.pausedCount + summary.endedCount} note={`${summary.pausedCount} paused, ${summary.endedCount} ended`} />
      </div>
      <p className="text-xs text-muted">Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included.</p>
      <MonthlyTrend rows={all} now={new Date()} />

      <Tabs label="Show" items={filters.map((f) => ({ href: href({ show: f.key }), label: f.label, active: show === f.key }))} />

      <form action={base} className="flex gap-2">
        {show ? <input type="hidden" name="show" value={show} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search by donor name or email"
          className={`${field} min-w-0 flex-1`}
        />
        <button className={blueAction}>Search</button>
      </form>

      {shown.length === 0 ? (
        <p className="rounded-card border-2 border-dashed border-honey bg-honey-soft/60 p-6 text-center text-sm text-muted">
          {all.length === 0
            ? "No monthly donations yet. One appears here once its first payment has gone through."
            : <NoMatch what="monthly donations" clearHref={base} />}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const state = monthlyState(r);
            const tag = monthlyStateLabel[state];
            const dedication = dedicationFrom(r.dedication_kind, r.dedication_name);
            const day = chargeDayLabel(r.charge_day);
            return (
              <li key={r.recurring_id} className="rounded-card border-2 border-border bg-surface p-4 text-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {!isErasedEmail(r.email) && r.display_name && isHebrew(r.display_name) ? (
                      <p className="truncate font-hebrew font-semibold text-indigo" lang="he" dir="rtl">{r.display_name}</p>
                    ) : (
                      <p className="truncate font-semibold text-indigo" dir="auto">{isErasedEmail(r.email) || !r.display_name ? ERASED_DONOR : r.display_name}</p>
                    )}
                    {shownEmail(r.email) ? <p className="break-all text-muted">{r.email}</p> : null}
                    {r.phone ? <p className="text-muted">{r.phone}</p> : null}
                  </div>
                  <p className="shrink-0 text-right font-display text-lg font-extrabold tabular-nums text-indigo">
                    {formatRand(r.amount_cents)}
                    <span className="block font-sans text-xs font-normal text-muted">a month</span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={tag.tone}>{tag.label}</Badge>
                  {r.wants_18a ? <Badge tone="brand">s18A requested</Badge> : null}
                  {r.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                </div>
                {dedication ? <p className="mt-2" dir="auto"><HebrewAware text={dedicationLine(dedication)} /></p> : null}
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
        <div className="flex items-center justify-between gap-2 text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className={secondaryAction}>← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className={secondaryAction}>Next →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
