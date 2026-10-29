import type { Metadata } from "next";
import Link from "next/link";
import { LiveFilterForm } from "@/components/forms/live-filter-form";
import { redirect } from "next/navigation";
import { NoMatch } from "@/components/no-match";
import { Badge } from "@/components/badge";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { donationStatus, donorName } from "@/lib/charity/dashboard";
import { applyDonationFilters, filtersToQuery, parseDonationFilters, periodOptions, periodText, type PeriodKey } from "@/lib/charity/donation-filters";
import { DONATION_FIELDS, loadCampaignTitles, type DonationRow } from "@/lib/charity/dashboard-queries";
import { GIFT_SOURCES, giftSourceLabel } from "@/lib/donations/source";
import { formatDate } from "@/lib/dates";
import { DonePanel } from "@/components/done-panel";
import { RECORDED_METHODS, type RecordedMethod } from "@/lib/charity/recorded-gifts";
import { formatRand } from "@/lib/money";
import { Card } from "@/components/card";
import { ActionLink, blueAction, EmptyState, field, PageHeader, rowLink, secondaryAction, Tabs } from "@/components/dash";
import { showDay } from "@/lib/typed-date";
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
  // "Choose dates" with dates we couldn't read: say so, and keep what was typed, rather than quietly showing everything.
  const typedFrom = typeof sp.from === "string" ? sp.from.slice(0, 10) : "";
  const typedTo = typeof sp.to === "string" ? sp.to.slice(0, 10) : "";
  const datesUnread = sp.period === "custom" && filters.period !== "custom";
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
  const [{ data, count, error }, totals, campaigns] = await Promise.all([query, loadTotals(supabase, id, filters), loadCampaignTitles(id)]);
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
  const campaignName = filters.campaign === "none" ? "no campaign" : filters.campaign ? campaigns.get(filters.campaign) ?? "a campaign" : null;
  const narrowed = Boolean(q || status !== "all" || filters.period !== "all" || filters.campaign || filters.source);

  return (
    <div className="space-y-5">
      <DonePanel charity={charity} sp={sp} here={base} />
      <PageHeader
        title="Donations"
        intro="Record a gift or import a file for EFT, cash and other gifts that didn't come through Givezy."
        actions={
          <>
            <ActionLink href={`${base}/deposits`}>Deposits</ActionLink>
            <ActionLink href={`${base}/import`}>Import from a file</ActionLink>
            <ActionLink href={`${base}/record`} primary>Record a gift</ActionLink>
          </>
        }
      />

      <Card>
        <LiveFilterForm action={base} className="space-y-3">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <div className="flex min-w-0 gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name or email"
              aria-label="Search by donor name or email"
              className={`${field} min-w-0 flex-1`}
            />
            <button className={blueAction}>Search</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="period">Period</label>
            <select id="period" name="period" defaultValue={filters.period} className={`${field} min-w-0 max-w-full`}>
              {Object.entries(periodOptions).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-muted">From <input type="text" name="from" placeholder="dd/mm/yyyy" autoComplete="off" maxLength={10} defaultValue={filters.period === "custom" ? showDay(filters.fromDate) : datesUnread ? typedFrom : ""} className={`${field} w-32 tabular-nums`} /></label>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-muted">To <input type="text" name="to" placeholder="dd/mm/yyyy" autoComplete="off" maxLength={10} defaultValue={filters.period === "custom" ? showDay(filters.toDate) : datesUnread ? typedTo : ""} className={`${field} w-32 tabular-nums`} /></label>
          </div>
          {datesUnread ? (
            <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">We couldn&apos;t read those dates, so this shows all donations. Write both as dd/mm/yyyy, for example 01/03/2026, and search again.</p>
          ) : (
            <p className="text-xs text-muted">For your own dates, choose &quot;Choose dates&quot; and fill in both, as dd/mm/yyyy.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {campaigns.size ? (
              <>
                <label className="sr-only" htmlFor="campaign">Campaign</label>
                <select id="campaign" name="campaign" defaultValue={filters.campaign} className={`${field} min-w-0 max-w-full`}>
                  <option value="">Every campaign</option>
                  <option value="none">No campaign</option>
                  {[...campaigns].sort((a, b) => a[1].localeCompare(b[1])).map(([cid, title]) => <option key={cid} value={cid}>{title}</option>)}
                </select>
              </>
            ) : null}
            <label className="sr-only" htmlFor="source">Came from</label>
            <select id="source" name="source" defaultValue={filters.source} className={`${field} min-w-0 max-w-full`}>
              <option value="">From anywhere</option>
              {Object.entries(GIFT_SOURCES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              <option value="unknown">Not known (before 21/10/2026)</option>
            </select>
          </div>
        </LiveFilterForm>
      </Card>

      {/* Totals for everything the filters match, not just this page. */}
      <div className="rounded-card border-2 border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 text-sm">
            <p className="font-display text-3xl font-extrabold leading-tight text-indigo tabular-nums">{formatRand(totals.paidCents)}</p>
            <p className="mt-1 [overflow-wrap:anywhere]">
              Received from {totals.paidCount} {totals.paidCount === 1 ? "donation" : "donations"}
              {range ? <span className="text-muted">, {range}</span> : null}
              {q ? <span className="text-muted">, matching &quot;{q}&quot;</span> : null}
              {campaignName ? <span className="text-muted">, for {filters.campaign === "none" ? campaignName : <>&quot;{campaignName}&quot;</>}</span> : null}
              {filters.source ? <span className="text-muted">, from {filters.source === "unknown" ? "an unknown source" : GIFT_SOURCES[filters.source]}</span> : null}.
            </p>
            {narrowed && totals.paidCount ? (
              <p className="mt-1 text-muted">From {totals.donorCount} {totals.donorCount === 1 ? "donor" : "donors"}.</p>
            ) : null}
            {totals.reversedCount ? (
              <p className="mt-1 text-muted">
                Not counted: {formatRand(totals.reversedCents)} refunded or charged back ({totals.reversedCount}).
              </p>
            ) : null}
          </div>
          {/* Paid only by default, so the bookkeeper's total is income received. */}
          <div className="flex flex-wrap gap-2">
            <a href={csvHref} className={secondaryAction}>
              {status === "all" || status === "paid" ? "Download paid donations (CSV)" : "Download CSV"}
            </a>
            <a href={`${csvHref}&format=xlsx`} className={secondaryAction}>Same in Excel</a>
            {status === "all" ? (
              <a href={csvAllHref} className={secondaryAction}>Every status</a>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs
        label="Show donations"
        items={statusTabs.map((f) => ({ href: href({ status: f }), label: f === "all" ? "All" : donationStatus[f].label, active: f === status }))}
      />

      {rows.length === 0 ? (
        narrowed ? (
          <EmptyState title="No matches">
            <NoMatch what="donations" clearHref={base} />
          </EmptyState>
        ) : (
          <EmptyState title="No donations yet">They appear here once a payment goes through.</EmptyState>
        )
      ) : (
        <Card lights>
          <ul className="divide-y divide-border">
            {rows.map((d) => {
              const s = donationStatus[d.status];
              return (
                <li key={d.id} className="py-1 first:pt-0 last:pb-0">
                  <Link href={`${base}/${d.id}`} className={`${rowLink} items-start text-sm`}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-indigo group-hover:text-brand group-hover:underline">{donorName(d)}</p>
                      <p className="text-muted">{formatDate(d.paid_at ?? d.created_at)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {d.wants_18a ? <Badge tone="brand">s18A requested</Badge> : null}
                        {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                        {d.recorded_method ? <Badge>Recorded: {RECORDED_METHODS[d.recorded_method as RecordedMethod] ?? "by you"}</Badge> : null}
                        {d.campaign_id ? <Badge>{campaigns.get(d.campaign_id) ?? "A campaign"}</Badge> : null}
                        {d.came_from && d.came_from !== "recorded" ? <Badge>{giftSourceLabel(d.came_from)}</Badge> : null}
                      </div>
                    </div>
                    <p className="shrink-0 font-display text-lg font-bold text-indigo tabular-nums">{formatRand(d.amount_cents)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-2 text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className={secondaryAction}>← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className={secondaryAction}>Next →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}

type Totals = { paidCents: number; paidCount: number; reversedCents: number; reversedCount: number; donorCount: number };

/** Totals of every donation the filters match, read in pages (whole cents, no floats). */
async function loadTotals(supabase: Awaited<ReturnType<typeof createClient>>, charityId: string, filters: ReturnType<typeof parseDonationFilters>): Promise<Totals> {
  const t: Totals = { paidCents: 0, paidCount: 0, reversedCents: 0, reversedCount: 0, donorCount: 0 };
  const donors = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await applyDonationFilters(
      supabase.from("charity_donations").select("id, donor_id, status, amount_cents").eq("charity_id", charityId).order("id").range(from, from + 999),
      filters,
    );
    if (error) throw error;
    for (const r of data ?? []) {
      const cents = Number(r.amount_cents);
      if (r.status === "paid") {
        t.paidCents += cents;
        t.paidCount++;
        donors.add(r.donor_id as string);
      } else if (r.status === "refunded" || r.status === "charged_back") {
        t.reversedCents += cents;
        t.reversedCount++;
      }
    }
    if (!data || data.length < 1000) break;
  }
  t.donorCount = donors.size;
  return t;
}
