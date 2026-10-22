import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "../poster/print-button";
import { requireViewer } from "@/lib/auth";
import { annualReport, reportYears } from "@/lib/charity/annual-report";
import { loadReportData } from "@/lib/charity/dashboard-queries";
import { saDate } from "@/lib/charity/dashboard";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { impactTotal, impactUnitFrom } from "@/lib/charity/impact";

export const metadata: Metadata = { title: "Annual report" };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part * 100) / whole) : 0);

function Figure({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-card p-5 print:border print:border-border print:bg-white print:text-navy ${strong ? "bg-indigo text-white" : "bg-honey-soft"}`}>
      <p className={`text-sm font-medium ${strong ? "text-honey print:text-muted" : "text-muted"}`}>{label}</p>
      <p className="mt-1 font-display text-3xl leading-tight">{value}</p>
      {note ? <p className={`mt-1 text-sm ${strong ? "text-white/80 print:text-muted" : "text-muted"}`}>{note}</p> : null}
    </div>
  );
}

/**
 * One tax year on one page, for the board or the AGM: raised, donors, monthly and once-off, the best
 * month, campaigns and s18A receipts. Save it as a PDF from the browser; the figures also come as a CSV.
 */
export default async function AnnualReportPage({ params, searchParams }: PageProps<"/charity-admin/[id]/report">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/report`);
  const { charity } = await loadCharityForManager(id);
  const sp = await searchParams;
  const now = new Date();
  const { gifts, campaignTitles, onIssued } = await loadReportData(id);
  const years = reportYears(gifts, now);
  const asked = Number(typeof sp.year === "string" ? sp.year : NaN);
  const year = years.includes(asked) ? asked : years[0];
  const r = annualReport(gifts, year, campaignTitles, onIssued, now);
  const base = `/charity-admin/${id}/report`;
  const top = Math.max(1, ...r.months.map((m) => m.cents));
  const thisMonth = saDate(now).slice(0, 7);
  // The two shares always add to 100.
  const monthlyPct = pct(r.monthlyCents, r.totalCents);
  const unit = impactUnitFrom(charity);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-indigo">Annual report</h1>
          <p className="text-sm text-muted">
            {charity.name_en} · {taxYearLabel(year)}
            {r.running ? `, so far (to ${formatDate(now)})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <PrintButton label="Save as PDF" />
          <a href={`/charity-admin/${id}/export/report?year=${year}`} className="text-sm text-brand underline">Download the figures (CSV)</a>
        </div>
      </div>

      {years.length > 1 ? (
        <nav aria-label="Tax year" className="flex flex-wrap gap-2 text-sm print:hidden">
          {years.map((y) => (
            <Link
              key={y}
              href={y === years[0] ? base : `${base}?year=${y}`}
              aria-current={y === year ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 font-medium ${y === year ? "border-brand bg-brand text-brand-contrast" : "border-border bg-surface text-brand hover:bg-brand-soft"}`}
            >
              {y === years[0] ? `Tax year ${y} so far` : `Tax year ${y}`}
            </Link>
          ))}
        </nav>
      ) : null}

      {unit && r.totalCents > 0 && impactTotal(r.totalCents, unit) ? (
        <p className="rounded-card bg-honey-soft p-4 text-sm sm:p-5">
          <span className="font-display text-xl font-semibold text-indigo">Donors paid for {impactTotal(r.totalCents, unit)}.</span>
          <span className="mt-1 block text-muted">By your own figure of {formatRand(unit.cents)} for one {unit.one}.</span>
        </p>
      ) : null}

      {r.donationCount === 0 ? (
        <p className="rounded-card bg-honey-soft p-5 text-sm">
          No donations yet in tax year {year}. They appear here once a payment goes through.{r.refunded.count ? ` ${plural(r.refunded.count, "donation")} in this year ${r.refunded.count === 1 ? "was" : "were"} refunded.` : ""}
        </p>
      ) : (
        <>
          <section aria-label="The year in figures" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure strong label={r.running ? "Raised so far" : "Raised"} value={formatRand(r.totalCents)} note={`${plural(r.donationCount, "donation")}, ${formatRand(r.averageCents)} on average`} />
            <Figure label="Donors" value={String(r.donors)} note={`${r.newDonors} new, ${r.returningDonors} who gave before`} />
            <Figure label="Monthly donations" value={formatRand(r.monthlyCents)} note={`${monthlyPct}% of the year`} />
            <Figure label="Once-off donations" value={formatRand(r.onceOffCents)} note={`${r.totalCents > 0 ? 100 - monthlyPct : 0}% of the year`} />
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xl text-indigo">Month by month</h2>
            {r.bestMonth ? <p className="text-sm text-muted">The best month was {r.bestMonth.label}, with {formatRand(r.bestMonth.cents)} from {plural(r.bestMonth.count, "donation")}.</p> : null}
            <ul className="space-y-1.5 text-sm">
              {r.months.map((m) => (
                <li key={m.month} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
                  <span className="text-muted">{m.label}</span>
                  <span className="h-3 rounded-full bg-border" aria-hidden>
                    <span className="block h-3 rounded-full bg-brand print:bg-navy" style={{ width: `${Math.round((m.cents * 100) / top)}%` }} />
                  </span>
                  <span className="min-w-20 text-right tabular-nums">{m.cents ? formatRand(m.cents) : m.month > thisMonth ? <span className="text-muted">Still to come</span> : "None"}</span>
                </li>
              ))}
            </ul>
          </section>

          {r.campaigns.length ? (
            <section className="space-y-3">
              <h2 className="font-display text-xl text-indigo">Campaigns</h2>
              <ul className="divide-y divide-border rounded-card border border-border text-sm">
                {r.campaigns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                    <span className="min-w-0">{c.title}</span>
                    <span className="shrink-0 text-right">
                      <span className="font-semibold">{formatRand(c.cents)}</span> <span className="text-muted">({plural(c.count, "donation")})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="font-display text-xl text-indigo">s18A receipts</h2>
            {r.s18a.donors === 0 ? (
              <p className="text-sm text-muted">No donor asked for an s18A receipt in this tax year.</p>
            ) : r.running ? (
              <p className="text-sm">
                {plural(r.s18a.donors, "donor")} asked for an s18A receipt so far. Receipts are issued after the tax year ends on {formatDate(r.end)}.
              </p>
            ) : (
              <p className="text-sm">
                {plural(r.s18a.donors, "donor")} asked for an s18A receipt; {r.s18a.receipted} {r.s18a.receipted === 1 ? "has" : "have"} one.
                {r.s18a.waitingCents ? ` ${formatRand(r.s18a.waitingCents)} is still to be receipted.` : ""}
              </p>
            )}
          </section>

          {r.refunded.count ? (
            <p className="text-sm text-muted">
              Not counted above: {plural(r.refunded.count, "donation")} worth {formatRand(r.refunded.cents)} {r.refunded.count === 1 ? "was" : "were"} refunded or reversed by the donor&apos;s bank.
            </p>
          ) : null}
        </>
      )}

      <p className="text-xs text-muted">
        From Givezy&apos;s records of donations paid to {charity.name_en} through Givezy, on {formatDate(now)}. Donations made outside Givezy are not included.
      </p>
    </div>
  );
}
