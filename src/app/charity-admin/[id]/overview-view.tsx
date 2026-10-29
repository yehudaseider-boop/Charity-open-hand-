import Link from "next/link";
import { Card } from "@/components/card";
import { ShareLinks } from "./share-links";
import { MonthlyTrend } from "./monthly-trend";
import { DonationsChart } from "./month-bars";
import { RecentDonations, type RecentRow } from "./recent-donations";
import { GoalRing, Kpi, SourceBars } from "./overview-parts";
import type { gettingStarted } from "@/lib/charity/checklist";
import type { CampaignRow } from "@/lib/charity/campaign-queries";
import { averageCents, donationStatus, donorName, ERASED_DONOR, isErasedEmail, repeatPercent, saDate, type MonthlyRow, type monthlySummary, type thisTaxYear } from "@/lib/charity/dashboard";
import type { DonationRow, DonorRow, Insights, Overview } from "@/lib/charity/dashboard-queries";
import { type countDonorGroups, type donorGroupsFor, type giftsPerDonor, type lastMonths, monthlyTrend } from "@/lib/charity/insights";
import { progressPercent } from "@/lib/charity/campaigns";
import { initials } from "@/lib/charity/initials";
import type { impactUnitFrom } from "@/lib/charity/impact";
import { impactTotal } from "@/lib/charity/impact";
import { changeSince, giftSourceCounts, monthsFrom } from "@/lib/charity/overview";
import { giftSourceLabel } from "@/lib/donations/source";
import { formatDate, taxYearLabel, taxYearName, taxYearRange } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";

export type OverviewProps = {
  charityName: string;
  base: string;
  now: Date;
  publicLink: string;
  month: Overview;
  prev: Overview;
  year: Overview;
  all: Overview;
  taxYear: ReturnType<typeof thisTaxYear>;
  chart: ReturnType<typeof lastMonths>;
  recurring: MonthlyRow[];
  regular: ReturnType<typeof monthlySummary>;
  sources: { came_from: string | null }[];
  recent: DonationRow[];
  campaigns: CampaignRow[];
  activeCampaigns: CampaignRow[];
  start: ReturnType<typeof gettingStarted>;
  groups: ReturnType<typeof countDonorGroups>;
  donorGroups: ReturnType<typeof donorGroupsFor>;
  insights: Insights;
  donorCount: number;
  top: DonorRow[];
  giftsTotal: number;
  perDonor: ReturnType<typeof giftsPerDonor>;
  unit: ReturnType<typeof impactUnitFrom>;
  receipts: boolean;
  todo: { key: string; text: string; href: string; link: string }[];
};

/**
 * The Overview, drawn from figures the page has already worked out. Kept apart from the page so it can be
 * drawn from sample figures too (tests, previews), with no sign-in or database.
 */
export function OverviewView(p: OverviewProps) {
  const { charityName, base, now, publicLink, month, prev, year, all, taxYear, chart, recurring, regular, sources, recent, campaigns, activeCampaigns, start, groups, donorGroups, insights, donorCount, top, giftsTotal, perDonor, unit, receipts, todo } = p;
  const startDone = start.filter((i) => i.done).length;
  const today = saDate(now);
  // The figures' trends come from the same rows as the chart, so they always agree with it.
  const taxStart = taxYearRange(taxYear.taxYear).start;
  const trend = monthlyTrend(recurring, today, now, 12);
  const campaignTitles = new Map(campaigns.map((c) => [c.id, c.title]));
  const weekday = new Intl.DateTimeFormat("en-ZA", { weekday: "long", timeZone: "Africa/Johannesburg" }).format(now);
  const sourceRows = giftSourceCounts(sources);
  const recentRows: RecentRow[] = recent.map((d) => {
    const st = donationStatus[d.status];
    const name = donorName(d);
    return {
      id: d.id,
      status: d.status,
      statusLabel: st.label,
      tone: st.tone,
      donor: name,
      initials: initials(name) || "D",
      forWhat: d.campaign_id ? (campaignTitles.get(d.campaign_id) ?? "A campaign") : "General",
      from: d.recorded_method ? "Recorded by you" : giftSourceLabel(d.came_from),
      date: formatDate(d.paid_at ?? d.created_at),
      amount: formatRand(d.amount_cents),
      wants18a: d.wants_18a,
      href: `${base}/donations/${d.id}`,
    };
  });
  const pill = "inline-flex min-h-11 items-center rounded-control border-2 border-border bg-surface px-4 text-sm font-semibold text-brand hover:border-brand";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-indigo">Overview</h1>
          <p className="mt-1 text-sm text-muted">{weekday} {formatDate(now.toISOString())}. Here is what is happening at {charityName}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/poster`} className={pill}>Print a QR poster</Link>
          <Link href={`${base}/website-button`} className={pill}>Website button</Link>
          <Link href={`${base}/donations/record`} className="pressable inline-flex min-h-11 items-center rounded-control bg-coral px-5 text-sm font-bold text-navy">Record a gift</Link>
        </div>
      </div>

      {/* Shown until everything is done: what helps donors find you and give. */}
      {startDone < start.length ? (
        <Card title={`Getting started: ${startDone} of ${start.length} done`}>
          <ul className="space-y-2 text-sm">
            {start.map((i) => (
              <li key={i.key} className="flex items-start gap-2">
                <span aria-hidden className={i.done ? "text-success" : "text-muted"}>{i.done ? "✓" : "○"}</span>
                {i.done || !i.href ? (
                  <span className={i.done ? "text-muted line-through" : ""}>{i.label}</span>
                ) : (
                  <Link href={i.href} className="text-brand underline">{i.label}</Link>
                )}
                {i.done ? <span className="sr-only"> (done)</span> : null}
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-3 text-sm">
            <p className="mb-2">Share your Givezy page with your supporters:</p>
            <ShareLinks url={publicLink} message={`Give to ${charityName} on Givezy:`} />
            <Link href={`${base}/poster`} className="mt-2 inline-block text-brand underline">Print a QR poster for your notice board</Link>
            <Link href={`${base}/website-button`} className="mt-2 block text-brand underline">Add a &quot;Give with Givezy&quot; button to your website</Link>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi strong label="This month so far" value={formatRand(month.paid_cents)} note={`${plural(month.paid_count, "donation")} · last month ${formatRand(prev.paid_cents)}`} trend={chart.slice(-6).map((m) => m.amountCents)} />
        <Kpi label={`${taxYearName(taxYear.taxYear)} tax year`} value={formatRand(year.paid_cents)} note={plural(year.paid_count, "donation")} trend={monthsFrom(chart, taxStart).map((m) => m.amountCents)} />
        <Kpi
          label="Every month"
          value={formatRand(regular.runningCentsPerMonth)}
          note={`from ${plural(regular.runningCount, "monthly donor")}`}
          change={changeSince(trend[trend.length - 1].runningCents, trend[trend.length - 2]?.runningCents ?? 0)}
          changeNote="on the end of last month"
          trend={trend.slice(-6).map((p) => p.runningCents)}
        />
        <Kpi label="Donors" value={String(all.donor_count)} note={`${formatRand(all.paid_cents)} given in all`} />
      </div>
      <p className="text-xs text-muted">
        Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included. The payment provider&apos;s card fee comes off each donation before it reaches your bank.
        {" "}{taxYearLabel(taxYear.taxYear)}.
      </p>

      {/* What this tax year's gifts paid for, by the charity's own figure; or how to set one. */}
      {unit && year.paid_cents > 0 && impactTotal(year.paid_cents, unit) ? (
        <p className="rounded-card bg-honey-soft p-4 text-sm sm:p-5">
          <span className="font-display text-xl font-bold text-indigo">Your donors paid for {impactTotal(year.paid_cents, unit)} this tax year.</span>
          <span className="mt-1 block text-muted">
            By your own figure of {formatRand(unit.cents)} for one {unit.one}. Donors see what their gift pays for when they give.{" "}
            <Link href={`${base}/profile`} className="text-brand underline">Change it</Link>
          </span>
        </p>
      ) : !unit && all.paid_count > 0 ? (
        <p className="text-sm text-muted">
          Show donors what a gift pays for, for example &ldquo;Your R360 pays for 30 school breakfasts&rdquo;:{" "}
          <Link href={`${base}/profile`} className="text-brand underline">add your own figure</Link>.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card title="Donations by month">
            <DonationsChart months={chart} current={today.slice(0, 7)} donationsBase={`${base}/donations`} taxYearFrom={taxStart} taxYearName={taxYearName(taxYear.taxYear)} />
          </Card>
        </div>
        <div className="lg:col-span-4">
          <Card title="Where gifts come from">
            {sourceRows.length ? (
              <>
                <p className="-mt-2 mb-4 text-sm text-muted">Donations in the {taxYearName(taxYear.taxYear)} tax year</p>
                <SourceBars rows={sourceRows} />
              </>
            ) : (
              <p className="text-sm text-muted">This fills in once donations start coming in: from your page, a shared link, the QR poster, the app or your website button.</p>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card title="Recent donations" aside={<Link href={`${base}/donations`} className="text-sm font-semibold text-brand underline">See all donations</Link>}>
            {recentRows.length ? (
              <RecentDonations rows={recentRows} donationsHref={`${base}/donations`} />
            ) : (
              <p className="text-sm text-muted">Donations appear here as they come in, newest first. Share your page to get the first one.</p>
            )}
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-4">
          {all.paid_count > 0 ? (
            <Card title="Needs you this week">
              {todo.length === 0 ? (
                <p className="text-sm text-muted">Nothing needs you right now. New donors, declined monthly donations and campaigns about to end show up here.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {todo.map((t) => (
                    <li key={t.key} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
                      <p>{t.text}</p>
                      <Link href={t.href} className="font-semibold text-brand underline">{t.link}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {top.length > 0 ? (
            <Card title="Your biggest supporters">
              <ol className="space-y-3 text-sm">
                {top.map((d, i) => (
                  <li key={d.donor_id} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-navy ${["bg-honey", "bg-peach", "bg-brand-soft", "bg-success-soft"][i % 4]}`}>
                        {isErasedEmail(d.email) ? "?" : initials(d.display_name) || "D"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{isErasedEmail(d.email) ? ERASED_DONOR : d.display_name}</span>
                        <span className="block text-xs text-muted">{plural(d.donation_count, "donation")}</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatRand(d.total_cents)}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">All-time totals. A personal thank-you goes a long way.</p>
              <Link href={`${base}/donors`} className="mt-2 inline-block text-sm font-semibold text-brand underline">All donors</Link>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Campaigns">
          {activeCampaigns.length ? (
            <ul className="space-y-4">
              {activeCampaigns.map((c) => {
                const pct = progressPercent(c.raisedCents, c.targetCents);
                const line = `${formatRand(c.raisedCents)}${c.targetCents ? ` of ${formatRand(c.targetCents)}` : ""}${c.endsAt ? ` · ends ${formatDate(c.endsAt)}` : ""}`;
                return c.targetCents ? (
                  <GoalRing key={c.id} percent={pct} title={c.title} line={line} href={`${base}/campaigns`} />
                ) : (
                  <li key={c.id} className="text-sm">
                    <p className="font-semibold text-indigo">{c.title}</p>
                    <p className="text-muted">{line}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">Raising for something specific, like winter food parcels? Start a campaign with a goal, and donors see how close you are.</p>
          )}
          <Link href={`${base}/campaigns`} className="mt-4 inline-block text-sm font-semibold text-brand underline">{activeCampaigns.length ? "Manage campaigns" : "Start a campaign"}</Link>
        </Card>

        <Card title="Your donors">
          {all.paid_count === 0 ? (
            <p className="text-sm text-muted">These fill in once donations start coming in.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2">
                {donorGroups.map((g) => (
                  <li key={g.key}>
                    <Link href={`${base}/donors?group=${g.key}`} className="block h-full rounded-control border-2 border-border p-3 transition hover:border-brand">
                      <span className="block font-display text-2xl font-extrabold text-indigo">{groups[g.key]}</span>
                      <span className="block text-sm font-semibold">{g.label}</span>
                      <span className="block text-xs leading-snug text-muted">{g.hint}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li>
                  <span className="font-semibold">{repeatPercent(insights.repeatDonors, insights.allDonors)}%</span> of your donors have given more than once
                  <span className="text-muted"> ({insights.repeatDonors} of {insights.allDonors})</span>.
                </li>
                {perDonor ? (
                  <li>
                    On average, a donor has given <span className="font-semibold">{perDonor}</span> times
                    <span className="text-muted"> ({plural(giftsTotal, "donation")} from {plural(donorCount, "donor")}, all time)</span>.
                  </li>
                ) : null}
                <li>
                  {year.paid_count === 0 ? (
                    <>No donations yet this tax year. They appear here once a payment goes through.</>
                  ) : (
                    <>
                      The average donation this tax year is <span className="font-semibold">{formatRand(averageCents(year.paid_cents, year.paid_count))}</span>
                      <span className="text-muted"> ({plural(year.paid_count, "donation")})</span>.
                    </>
                  )}
                </li>
              </ul>
            </>
          )}
        </Card>

        <Card title="s18A receipts">
          {receipts ? (
            <p className="text-sm">
              {formatRand(year.receipt_requested_cents)} of this tax year&apos;s paid donations asked for an s18A receipt.
              Receipts are issued after the tax year ends on {formatDate(taxYear.end)}.{" "}
              <Link href={`${base}/receipts`} className="text-brand underline">See receipts</Link>
            </p>
          ) : (
            <p className="text-sm text-muted">
              Your charity can&apos;t issue s18A receipts yet: it needs confirmed s18A approval and a signed receipting mandate. Donors are told this when they give.
            </p>
          )}
        </Card>
      </div>

      <MonthlyTrend rows={recurring} now={now} seeAllHref={`${base}/monthly`} />

      <div className="flex flex-wrap gap-2 text-sm">
        <a href={`${base}/export/donations`} className="rounded-full border-2 border-border bg-surface px-4 py-2 font-semibold text-brand hover:border-brand">Download paid donations (CSV)</a>
      </div>
    </div>
  );
}
