import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { ActionLink, blueAction, EmptyState, MiniStat, PageHeader, secondaryAction, Tabs } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import {
  keepingDetails,
  keepingListKey,
  keepingListRows,
  keepingLists,
  keepingSummary,
  keepingWindow,
  keepingYearKey,
  keepingYears,
  retentionSentence,
  type KeepingList,
  type KeepingRow,
  type KeepingYearKey,
} from "@/lib/charity/keeping-donors";
import { KeepingNotSetUp, loadKeepingDonors } from "@/lib/charity/keeping-donors-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { isOwner, viewerCan } from "@/lib/charity/team";
import { journeysV2 } from "@/lib/charity/journey-write";
import { WINBACK_PRESS_CAP } from "@/lib/charity/journey";

export const metadata: Metadata = { title: "Keeping donors" };

const PAGE = 50;

/** Who gave again, who gave last year but not this one, who gave in an earlier year, and who gave more or less. */
export default async function KeepingDonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/keeping">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/keeping`);
  await loadCharityForManager(id);
  const canDownload = await viewerCan(id, "export");
  // The owner can add donors who haven't given since to the win-back journey (CRM step 7).
  const winBackOn = (await isOwner(id)) && (await journeysV2().catch(() => false));
  const sp = await searchParams;
  const w = keepingWindow(keepingYearKey(sp.year), new Date());
  const list = keepingListKey(sp.list);
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const base = `/charity-admin/${id}`;
  const href = (o: { year?: KeepingYearKey; list?: KeepingList; page?: number }) => {
    const y = o.year ?? w.key;
    const l = o.list ?? list;
    const p = o.page ?? 1;
    const qs = new URLSearchParams({ ...(y !== "this" ? { year: y } : {}), ...(l !== "lybunt" ? { list: l } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString();
    return qs ? `${base}/keeping?${qs}` : `${base}/keeping`;
  };

  // A failed read keeps the page, the tabs and the way back, and says plainly what to do.
  let rows: KeepingRow[] | null = null;
  let notSetUp = false;
  try {
    rows = await loadKeepingDonors(id, w);
  } catch (e) {
    notSetUp = e instanceof KeepingNotSetUp;
    rows = null;
  }
  const summary = keepingSummary(rows ?? []);
  const listed = keepingListRows(rows ?? [], list);
  const pages = Math.max(1, Math.ceil(listed.length / PAGE));
  const current = Math.min(page, pages);
  const shown = listed.slice((current - 1) * PAGE, current * PAGE);
  const soFar = w.running ? " so far" : "";
  const meta = keepingLists.find((l) => l.key === list)!;
  const canWinBack = winBackOn && (list === "lybunt" || list === "sybunt");

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href={`${base}/donors`}>← Donors</BackLink>}
        title="Keeping donors"
        intro={
          <>
            How many of last tax year&apos;s donors gave again in {w.words}, and who to get in touch with. Only donations that went through count; refunds don&apos;t. Gifts you recorded yourself count, as everywhere on your dashboard.
          </>
        }
        actions={rows && listed.length > 0 ? (canDownload ? <ActionLink download href={`${base}/export/keeping-donors?list=${list}${w.key === "last" ? "&year=last" : ""}`}>Download this list (CSV)</ActionLink> : null) : undefined}
      />

      <Tabs label="Tax year" items={keepingYears.map((y) => ({ href: href({ year: y.key, list }), label: y.label, active: w.key === y.key }))} />

      {rows === null ? (
        <section role="alert" className="space-y-3 rounded-card border-2 border-border bg-surface p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold text-indigo">{notSetUp ? "This page isn't switched on yet" : "We couldn't load this page"}</h2>
          <p className="text-sm text-navy">
            {notSetUp ? "Nothing is wrong with your donors or donations. Givezy is finishing setting this up; check back soon." : "Nothing was changed. It's usually a dropped connection: try again in a moment."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {notSetUp ? null : <a href={href({ page: current })} className={blueAction}>Try again</a>}
            <Link href={`${base}/donors`} className={secondaryAction}>Back to donors</Link>
          </div>
          <p className="text-xs text-muted">If it keeps happening, reply to any email we&apos;ve sent you and a person will help.</p>
        </section>
      ) : rows.length === 0 ? (
        <EmptyState title="No donors from earlier tax years yet" action={<ActionLink href={`${base}/donors`}>See your donors</ActionLink>}>
          Once you have donors from one tax year to the next, this page shows who gave again and who to get in touch with.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="retention" className="space-y-2 rounded-card border-2 border-border bg-surface p-4 sm:p-5">
            <h2 id="retention" className="font-display text-lg font-bold text-indigo">Gave again</h2>
            <p className="text-sm text-navy">{retentionSentence(summary, w)}</p>
            {summary.counts.lybunt > 0 ? (
              <p className="text-sm text-muted">
                The {plural(summary.counts.lybunt, "donor")} who haven&apos;t given again{soFar} gave {formatRand(summary.lybuntLastYearCents)} last tax year.
              </p>
            ) : null}
          </section>

          <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            {keepingLists.map((l) => (
              <li key={l.key}>
                <MiniStat strong={l.key === list} href={href({ list: l.key })} label={l.label} value={summary.counts[l.key]} note={l.key === list ? "Showing below" : "Show this list"} />
              </li>
            ))}
          </ul>

          <h2 className="font-display text-lg font-bold text-indigo">{meta.label}{w.running ? " (so far)" : ""}</h2>

          {listed.length === 0 ? (
            <p className="rounded-card border-2 border-border bg-surface p-4 text-sm text-muted">{meta.empty}</p>
          ) : (
            <>
              {pages > 1 ? (
                <p className="text-sm text-muted">
                  Showing {(current - 1) * PAGE + 1} to {(current - 1) * PAGE + shown.length} of {plural(listed.length, "donor")}, {PAGE} to a page. The download has them all.
                </p>
              ) : null}
              {canWinBack ? (
                <p className="text-sm text-muted">
                  Tick donors below to add them to your win-back journey, or{" "}
                  <Link href={`${base}/journey/winback?list=${list}${w.key === "last" ? "&year=last" : ""}&all=1`} className="font-semibold text-brand underline">
                    add everyone on this list
                  </Link>{" "}
                  (up to {WINBACK_PRESS_CAP} at a time). Ticks count for this page only. You&apos;ll see who joins before anything happens.
                </p>
              ) : null}
              <form method="get" action={`${base}/journey/winback`} className="space-y-2">
              <input type="hidden" name="list" value={list} />
              {w.key === "last" ? <input type="hidden" name="year" value="last" /> : null}
              <ul className="space-y-2">
                {shown.map((r, i) => {
                  const d = keepingDetails(r);
                  return (
                    <li key={r.donor_id ?? `erased-${current}-${i}`} className="rounded-card border-2 border-border bg-surface p-4 text-sm sm:p-5">
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
                          {formatRand(list === "sybunt" ? r.earlier_cents : r.last_cents)}
                          <span className="block font-sans text-xs font-normal text-muted">{list === "sybunt" ? "in earlier years" : `in ${w.lastName}`}</span>
                        </p>
                      </div>
                      <ul className="mt-2 space-y-0.5 text-muted">
                        {list === "more" || list === "less" ? <li>{formatRand(r.this_cents)} in {w.thisName}{soFar}</li> : null}
                        {d.lastPaidAt ? <li>Last donation on {formatDate(d.lastPaidAt)}</li> : null}
                        {r.recorded_only ? <li>Only gifts you recorded yourself</li> : null}
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
          <p className="text-xs text-muted">
            From the donor&apos;s page you can say thank you, add a note or set a follow-up. Givezy sends a donor at most one message a week from you.
          </p>
        </>
      )}
    </div>
  );
}
