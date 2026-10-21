import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NoMatch } from "@/components/no-match";
import { Badge } from "@/components/badge";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { donationStatus, donorName } from "@/lib/charity/dashboard";
import { applyDonationFilters, filtersToQuery, parseDonationFilters, periodOptions, periodText, type PeriodKey } from "@/lib/charity/donation-filters";
import { DONATION_FIELDS, type DonationRow } from "@/lib/charity/dashboard-queries";
import { formatDate } from "@/lib/dates";
import { DonePanel } from "@/components/done-panel";
import { RECORDED_METHODS, type RecordedMethod } from "@/lib/charity/recorded-gifts";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Donations" };

const PAGE = 25;
// Only donations that went through: abandoned and failed checkouts stay private (see the charity_donations view).
const statusTabs = ["all", "paid", "refunded", "charged_back"] as const;

export default async function DonationsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donations">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donations`);
  const { charity } = await loadCharityForManager(id);
  const sp = await searchParams;
  const filters = parseDonationFilters(sp);
  const { status, q } = filters;
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const supabase = await createClient();
  const query = applyDonationFilters(
    supabase
      .from("charity_donations")
      .select(DONATION_FIELDS, { count: "exact" })
      .eq("charity_id", id)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1),
    filters,
  );
  const [{ data, count, error }, totals] = await Promise.all([query, loadTotals(supabase, id, filters)]);
  // A page past the end (an old link, a typed number) is the database saying "out of range": show page 1's link instead of an error.
  if (error && error.code !== "PGRST103") throw error;
  // Every filter is kept (custom dates too), so the totals don't quietly change.
  if (error?.code === "PGRST103") redirect(`/charity-admin/${id}/donations?${filtersToQuery(filters)}`.replace(/\?$/, ""));
  const rows = (data ?? []) as unknown as DonationRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const base = `/charity-admin/${id}/donations`;
  const href = (over: { status?: typeof status; page?: number; period?: PeriodKey }) => {
    const f = { ...filters, ...(over.status ? { status: over.status } : {}), ...(over.period ? { period: over.period } : {}) };
    const s = filtersToQuery(f, over.page && over.page > 1 ? { page: String(over.page) } : {});
    return s ? `${base}?${s}` : base;
  };
  // The download matches the screen; with "All" it is paid donations only, so its total is income received.
  const csvBase = `/charity-admin/${id}/export/donations`;
  const csvHref = `${csvBase}?${filtersToQuery({ ...filters, status: status === "all" ? "paid" : status })}`;
  const csvAllHref = `${csvBase}?${filtersToQuery(filters, { status: "all" })}`;
  const range = periodText(filters);

  return (
    <div className="space-y-4">
      <DonePanel charity={charity} sp={sp} here={base} />
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl text-indigo">Donations</h1>
        {/* Paid only by default, so the bookkeeper's total is income received. */}
        <div className="text-right text-sm">
          <a href={csvHref} className="text-brand underline">
            {status === "all" || status === "paid" ? "Download paid donations (CSV)" : "Download CSV"}
          </a>
          {status === "all" ? (
            <a href={csvAllHref} className="mt-1 block text-xs text-muted underline">Every status</a>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`${base}/record`} className="pressable rounded-control border border-border bg-surface px-3 py-2 font-medium text-navy">Record a gift</Link>
        <Link href={`${base}/import`} className="pressable rounded-control border border-border bg-surface px-3 py-2 font-medium text-navy">Import from a file</Link>
        <span className="self-center text-xs text-muted">For EFT, cash and other gifts that didn&apos;t come through Givezy.</span>
      </div>

      <form action={base} className="space-y-2">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="period">Period</label>
          <select id="period" name="period" defaultValue={filters.period} className="rounded-control border border-border bg-surface px-3 py-2.5">
            {Object.entries(periodOptions).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <label className="flex items-center gap-1 text-sm">From <input type="date" name="from" defaultValue={filters.period === "custom" ? filters.fromDate ?? "" : ""} className="rounded-control border border-border bg-surface px-2 py-2" /></label>
          <label className="flex items-center gap-1 text-sm">To <input type="date" name="to" defaultValue={filters.period === "custom" ? filters.toDate ?? "" : ""} className="rounded-control border border-border bg-surface px-2 py-2" /></label>
        </div>
        <p className="text-xs text-muted">For your own dates, choose &quot;Choose dates&quot; and fill in both.</p>
        <div className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search by donor name or email"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
        </div>
      </form>

      {/* Totals for everything the filters match, not just this page. */}
      <div className="rounded-card border border-border bg-surface p-4 text-sm">
        <p>
          <span className="font-semibold">{formatRand(totals.paidCents)}</span> received from {totals.paidCount} {totals.paidCount === 1 ? "donation" : "donations"}
          {range ? <span className="text-muted">, {range}</span> : null}
          {q ? <span className="text-muted">, matching &quot;{q}&quot;</span> : null}.
        </p>
        {totals.reversedCount ? (
          <p className="mt-1 text-muted">
            Not counted: {formatRand(totals.reversedCents)} refunded or charged back ({totals.reversedCount}).
          </p>
        ) : null}
      </div>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        {statusTabs.map((f) => (
          <Link
            key={f}
            href={href({ status: f })}
            className={`shrink-0 rounded-full border px-3 py-1.5 ${f === status ? "border-brand bg-brand-soft text-indigo" : "border-border"}`}
          >
            {f === "all" ? "All" : donationStatus[f].label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{q || status !== "all" || filters.period !== "all" ? <NoMatch what="donations" clearHref={base} /> : "No donations yet. They appear here once a payment goes through."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => {
            const s = donationStatus[d.status];
            return (
              <li key={d.id}>
                <Link href={`${base}/${d.id}`} className="block rounded-card border border-border bg-surface p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{donorName(d)}</p>
                      <p className="text-muted">{formatDate(d.paid_at ?? d.created_at)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {d.wants_18a ? <Badge tone="brand">s18A requested</Badge> : null}
                        {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                        {d.recorded_method ? <Badge>Recorded: {RECORDED_METHODS[d.recorded_method as RecordedMethod] ?? "by you"}</Badge> : null}
                      </div>
                    </div>
                    <p className="shrink-0 font-semibold">{formatRand(d.amount_cents)}</p>
                  </div>
                </Link>
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

type Totals = { paidCents: number; paidCount: number; reversedCents: number; reversedCount: number };

/** Totals of every donation the filters match, read in pages (whole cents, no floats). */
async function loadTotals(supabase: Awaited<ReturnType<typeof createClient>>, charityId: string, filters: ReturnType<typeof parseDonationFilters>): Promise<Totals> {
  const t: Totals = { paidCents: 0, paidCount: 0, reversedCents: 0, reversedCount: 0 };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await applyDonationFilters(
      supabase.from("charity_donations").select("id, status, amount_cents").eq("charity_id", charityId).order("id").range(from, from + 999),
      filters,
    );
    if (error) throw error;
    for (const r of data ?? []) {
      const cents = Number(r.amount_cents);
      if (r.status === "paid") {
        t.paidCents += cents;
        t.paidCount++;
      } else if (r.status === "refunded" || r.status === "charged_back") {
        t.reversedCents += cents;
        t.reversedCount++;
      }
    }
    if (!data || data.length < 1000) break;
  }
  return t;
}
