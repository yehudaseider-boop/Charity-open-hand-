import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { ActionLink, blueAction, EmptyState, MiniStat, PageHeader, secondaryAction, Tabs } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { lapsedDetails, lapsedPeriod, lapsedPeriodKey, lapsedPeriods, lapsedReasonLabel, lapsedSummary, type LapsedPeriodKey, type LapsedRow } from "@/lib/charity/lapsed-monthly";
import { loadLapsedMonthly } from "@/lib/charity/lapsed-monthly-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { isOwner, viewerCan } from "@/lib/charity/team";
import { journeysV2 } from "@/lib/charity/journey-write";
import { WINBACK_PRESS_CAP } from "@/lib/charity/journey";

export const metadata: Metadata = { title: "Monthly donors who stopped" };

const PAGE = 50;

/** Monthly donors who stopped in a chosen period, newest first, so the charity can get in touch. */
export default async function StoppedMonthlyPage({ params, searchParams }: PageProps<"/charity-admin/[id]/monthly/stopped">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/monthly/stopped`);
  await loadCharityForManager(id);
  const canDownload = await viewerCan(id, "export");
  // The owner can add donors from here to the win-back journey (CRM step 7), once journeys have their own ids.
  const canWinBack = (await isOwner(id)) && (await journeysV2().catch(() => false));
  const sp = await searchParams;
  const period = lapsedPeriod(lapsedPeriodKey(sp.period), new Date());
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const base = `/charity-admin/${id}`;
  const href = (o: { period?: LapsedPeriodKey; page?: number }) => {
    const k = o.period ?? period.key;
    const p = o.page ?? 1;
    const qs = new URLSearchParams({ ...(k !== "tax-year" ? { period: k } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString();
    return qs ? `${base}/monthly/stopped?${qs}` : `${base}/monthly/stopped`;
  };

  // A failed read keeps the page, the period tabs and the way back, and says plainly what to do.
  let rows: LapsedRow[] | null = null;
  try {
    rows = await loadLapsedMonthly(id, period);
  } catch {
    rows = null;
  }
  const summary = lapsedSummary(rows ?? []);
  const pages = Math.max(1, Math.ceil(summary.count / PAGE));
  const current = Math.min(page, pages);
  const shown = (rows ?? []).slice((current - 1) * PAGE, current * PAGE);

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href={`${base}/monthly`}>← Monthly donations</BackLink>}
        title="Monthly donors who stopped"
        intro={<>Donors whose monthly donation was cancelled or stopped in {period.words}, newest first. A paused donation is not counted, and nor is a donor who has since started a new monthly donation to you.</>}
        actions={rows && rows.length > 0 ? (canDownload ? <ActionLink download href={`${base}/export/stopped-monthly?period=${period.key}`}>Download this list (CSV)</ActionLink> : null) : undefined}
      />

      <Tabs label="Period" items={lapsedPeriods.map((p) => ({ href: href({ period: p.key }), label: p.label, active: period.key === p.key }))} />

      {rows === null ? (
        <section role="alert" className="space-y-3 rounded-card border-2 border-border bg-surface p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold text-indigo">We couldn&apos;t load this list</h2>
          <p className="text-sm text-navy">Nothing was changed. It&apos;s usually a dropped connection: try again in a moment.</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={href({ page: current })} className={blueAction}>Try again</a>
            <Link href={`${base}/monthly`} className={secondaryAction}>Back to monthly donations</Link>
          </div>
          <p className="text-xs text-muted">If it keeps happening, reply to any email we&apos;ve sent you and a person will help.</p>
        </section>
      ) : rows.length === 0 ? (
        <EmptyState title="No monthly donors stopped in this period" action={<ActionLink href={`${base}/monthly`}>See all monthly donations</ActionLink>}>
          When a monthly donation is cancelled or its card keeps failing, the donor appears here.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <MiniStat strong label="Stopped" value={summary.count} note={summary.count === 1 ? "monthly donor" : "monthly donors"} />
            <MiniStat label="No longer coming in" value={formatRand(summary.centsPerMonth)} note="a month" />
          </div>
          <p className="text-xs text-muted">Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included.</p>

          {pages > 1 ? (
            <p className="text-sm text-muted">
              Showing {(current - 1) * PAGE + 1} to {(current - 1) * PAGE + shown.length} of {plural(summary.count, "donor")}, {PAGE} to a page. The download has them all.
            </p>
          ) : null}

          {canWinBack ? (
            <p className="text-sm text-muted">
              Tick donors below to add them to your win-back journey, or{" "}
              <Link href={`${base}/journey/winback?list=stopped&period=${period.key}&all=1`} className="font-semibold text-brand underline">
                add everyone on this list
              </Link>{" "}
              (up to {WINBACK_PRESS_CAP} at a time). You&apos;ll see who joins before anything happens.
            </p>
          ) : null}

          <form method="get" action={`${base}/journey/winback`} className="space-y-2">
          <input type="hidden" name="list" value="stopped" />
          <input type="hidden" name="period" value={period.key} />
          <ul className="space-y-2">
            {shown.map((r) => {
              const d = lapsedDetails(r);
              return (
                <li key={r.recurring_id} className="rounded-card border-2 border-border bg-surface p-4 text-sm sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    {canWinBack && d.donorId ? (
                      <input type="checkbox" name="d" value={d.donorId} aria-label={`Choose ${d.name} for the win-back journey`} className="mt-1 size-5 shrink-0 accent-brand" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-indigo" dir="auto">{d.name}</p>
                      {d.email ? <p className="break-all text-muted">{d.email}</p> : null}
                      {d.phone ? <p className="text-muted">{d.phone}</p> : null}
                    </div>
                    <p className="shrink-0 text-right font-display text-lg font-extrabold tabular-nums text-indigo">
                      {formatRand(r.amount_cents)}
                      <span className="block font-sans text-xs font-normal text-muted">a month</span>
                    </p>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-muted">
                    <li>Ended on {formatDate(r.ended_at)}: {lapsedReasonLabel[r.reason].charAt(0).toLowerCase() + lapsedReasonLabel[r.reason].slice(1)}</li>
                    {d.lastPaidAt ? <li>Last donation on {formatDate(d.lastPaidAt)}</li> : null}
                  </ul>
                  {d.donorId ? (
                    <p className="mt-3">
                      <Link href={`${base}/donors/${d.donorId}`} className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:underline">
                        Open this donor&apos;s page<span className="sr-only">: <span dir="auto">{d.name}</span></span> →
                      </Link>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {canWinBack ? (
            <button className="inline-flex min-h-11 items-center rounded-control border-2 border-border px-4 text-sm font-semibold text-brand">Add ticked donors to win-back journey</button>
          ) : null}
          </form>

          {pages > 1 ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              {current > 1 ? <Link href={href({ page: current - 1 })} className={secondaryAction}>← Previous</Link> : <span />}
              <span className="text-muted">Page {current} of {pages}</span>
              {current < pages ? <Link href={href({ page: current + 1 })} className={secondaryAction}>Next →</Link> : <span />}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
