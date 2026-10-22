import type { Metadata } from "next";
import Link from "next/link";
import { SupportContact } from "@/components/legal";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { gettingStarted } from "@/lib/charity/checklist";
import { loadCharityForManager, loadStories } from "@/lib/charity/queries";
import { ShareLinks } from "./share-links";
import { MonthlyTrend } from "./monthly-trend";
import { allTime, averageCents, ERASED_DONOR, isErasedEmail, lastMonth, monthlySummary, repeatPercent, saDate, thisMonth, thisTaxYear } from "@/lib/charity/dashboard";
import { countDonorGroups, donorGroupsFor, endsWithinAWeek, giftsPerDonor, lapsedPeriodText, lastMonths, monthlyAttention, topDonors } from "@/lib/charity/insights";
import { dueReminders, lapsedDaysFor } from "@/lib/charity/donor-care";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { isRunning, progressPercent } from "@/lib/charity/campaigns";
import { loadDonors, loadInsights, loadMonthlyDonations, loadMonthlyTotals, loadOverview } from "@/lib/charity/dashboard-queries";
import { formatDate, isoDateInJhb, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";

export const metadata: Metadata = { title: "Overview" };

function Stat({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-card p-5 ${strong ? "bg-indigo text-white" : "bg-honey-soft"}`}>
      <p className={`text-sm font-medium ${strong ? "text-honey" : "text-muted"}`}>{label}</p>
      <p className="mt-1 font-display text-3xl leading-tight">{value}</p>
      {note ? <p className={`mt-1 text-sm ${strong ? "text-white/80" : "text-muted"}`}>{note}</p> : null}
    </div>
  );
}


export default async function CharityDashboardPage({ params }: PageProps<"/charity-admin/[id]">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}`);
  const { charity } = await loadCharityForManager(id);
  const base = `/charity-admin/${id}`;

  if (charity.status === "suspended") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-indigo">Overview</h1>
        <Notice tone="danger">
          <p className="font-medium">Your page is paused</p>
          <p className="mt-1">While it is paused, your page is hidden and donors can&apos;t give to you. Monthly donations aren&apos;t collected. Your past donations and receipts are kept.</p>
          {charity.rejection_reason ? <p className="mt-2 whitespace-pre-line">The reason: {charity.rejection_reason}</p> : null}
          <p className="mt-2">To sort this out, <SupportContact />.</p>
        </Notice>
        <p className="text-sm">
          <Link href={`${base}/donations`} className="text-brand underline">Your donations</Link>
          {" · "}
          <Link href={`${base}/receipts`} className="text-brand underline">s18A receipts</Link>
        </p>
      </div>
    );
  }
  if (charity.status !== "approved") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-indigo">Overview</h1>
        {charity.status === "rejected" ? (
          <Notice tone="warning">
            <p className="font-medium">Your application was sent back for changes</p>
            {charity.rejection_reason ? <p className="mt-1 whitespace-pre-line">{charity.rejection_reason}</p> : null}
            <p className="mt-2"><Link href={`${base}/application`} className="underline">Make the changes and submit again</Link>.</p>
          </Notice>
        ) : charity.status === "pending_review" ? (
          <Notice tone="neutral">
            Your application is with us for review. We&apos;ll email you when it&apos;s done.{" "}
            <Link href={`${base}/application`} className="underline">See your application</Link>.
          </Notice>
        ) : (
          <Notice tone="warning">
            Donations start once your application is approved.{" "}
            <Link href={`${base}/application`} className="underline">Finish your application</Link>.
          </Notice>
        )}
      </div>
    );
  }

  const now = new Date();
  const taxYear = thisTaxYear(now);
  const [month, prev, year, all, monthly, recurring, insights, campaigns, stories, donors] = await Promise.all([
    loadOverview(id, thisMonth(now)),
    loadOverview(id, lastMonth(now)),
    loadOverview(id, taxYear),
    loadOverview(id, allTime),
    loadMonthlyTotals(id, 12),
    loadMonthlyDonations(id),
    loadInsights(id, thisMonth(now)),
    loadCampaigns(id),
    loadStories(id, 1),
    loadDonors(id),
  ]);
  const [lapsedDays, due] = await Promise.all([lapsedDaysFor(id), dueReminders(id, isoDateInJhb(now))]);
  const donorGroups = donorGroupsFor(lapsedDays);
  const activeCampaigns = campaigns.filter((c) => isRunning(c, now));
  const start = gettingStarted(charity, { updates: stories.updates.length, campaigns: campaigns.length }, base);
  const startDone = start.filter((i) => i.done).length;
  const publicLink = `${(process.env.SITE_URL ?? "").replace(/\/+$/, "")}/c/${charity.slug}`;
  const regular = monthlySummary(recurring);
  const receipts = canIssue18a(charity);
  const today = saDate(now);
  const chart = lastMonths(monthly, today, 12);
  const groups = countDonorGroups(donors, now, lapsedDays);
  const top = topDonors(donors, 5);
  const giftsTotal = donors.reduce((t, d) => t + d.donation_count, 0);
  const perDonor = giftsPerDonor(giftsTotal, donors.length);
  const needs = monthlyAttention(recurring, now);
  const endingSoon = activeCampaigns.filter((c) => endsWithinAWeek(c.endsAt, now));
  // Each line links to the page where the charity can act on it. Unpaid attempts are not shown to charities.
  const todo: { key: string; text: string; href: string; link: string }[] = [];
  if (insights.newDonors > 0) todo.push({ key: "new", text: `${plural(insights.newDonors, "new donor")} this month`, href: `${base}/thank-donors`, link: "Say thank you" });
  if (needs.retrying > 0) todo.push({ key: "retry", text: `${plural(needs.retrying, "monthly donation")} declined this month and being tried again`, href: `${base}/monthly?show=running`, link: "See who" });
  if (needs.endedRecently > 0) todo.push({ key: "ended", text: `${plural(needs.endedRecently, "monthly donation")} stopped or cancelled in the last 30 days (${formatRand(needs.endedRecentlyCents)} a month)`, href: `${base}/monthly?show=ended`, link: "See who" });
  if (needs.pausedRecently > 0) todo.push({ key: "paused", text: `${plural(needs.pausedRecently, "monthly donor")} paused in the last 30 days`, href: `${base}/monthly?show=paused`, link: "See who" });
  if (groups.lapsed > 0) todo.push({ key: "lapsed", text: `${plural(groups.lapsed, "donor")} ${groups.lapsed === 1 ? "hasn't" : "haven't"} given in the last ${lapsedPeriodText(lapsedDays)}`, href: `${base}/donors?group=lapsed`, link: "See who" });
  // Follow-ups the charity set itself, due today or earlier: the first few by name, then the count.
  for (const r of due.slice(0, 5)) todo.push({ key: `f-${r.id}`, text: `Follow up with ${r.donor_name}: ${r.what}${r.due_on < isoDateInJhb(now) ? ` (was due ${formatDate(`${r.due_on}T12:00:00+02:00`)})` : ""}`, href: `${base}/donors/${r.donor_id}`, link: "Open" });
  if (due.length > 5) todo.push({ key: "f-more", text: `${plural(due.length - 5, "more follow-up")} due`, href: `${base}/donors`, link: "See donors" });
  for (const c of endingSoon) todo.push({ key: `c-${c.id}`, text: `"${c.title}" ends on ${formatDate(c.endsAt as string)}${c.targetCents ? `, at ${progressPercent(c.raisedCents, c.targetCents)}% of its goal` : ""}`, href: `${base}/campaigns`, link: "Share it again" });
  if (all.refunded_count > 0) todo.push({ key: "refund", text: `${plural(all.refunded_count, "donation")} refunded (${formatRand(all.refunded_cents)})`, href: `${base}/donations?status=refunded`, link: "See them" });
  if (all.charged_back_count > 0) todo.push({ key: "cb", text: `${plural(all.charged_back_count, "donation")} charged back`, href: `${base}/donations?status=charged_back`, link: "See them" });
  const max = Math.max(1, ...chart.map((m) => m.amountCents));
  const anyGifts = chart.some((m) => m.amountCents > 0);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-indigo">Overview</h1>

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
            <ShareLinks url={publicLink} message={`Give to ${charity.name_en} on Givezy:`} />
            <Link href={`${base}/poster`} className="mt-2 inline-block text-brand underline">Print a QR poster for your notice board</Link>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat strong label="This month" value={formatRand(month.paid_cents)} note={`${plural(month.paid_count, "donation")} · last month ${formatRand(prev.paid_cents)}`} />
        <Stat label={`Tax year ${taxYear.taxYear}`} value={formatRand(year.paid_cents)} note={plural(year.paid_count, "donation")} />
        <Stat label="Every month" value={formatRand(regular.runningCentsPerMonth)} note={`from ${plural(regular.runningCount, "monthly donor")}`} />
        <Stat label="Donors" value={String(all.donor_count)} note={`${formatRand(all.paid_cents)} given in all`} />
      </div>
      <p className="text-xs text-muted">
        Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included. The payment provider&apos;s card fee comes off each donation before it reaches your bank.
        {" "}{taxYearLabel(taxYear.taxYear)}.
      </p>

      {all.paid_count > 0 ? (
        <Card title="Needs you this week">
          {todo.length === 0 ? (
            <p className="text-sm text-muted">Nothing needs you right now. New donors, declined monthly donations and campaigns about to end show up here.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {todo.map((t) => (
                <li key={t.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">{t.text}</span>
                  <Link href={t.href} className="shrink-0 font-medium text-brand underline">{t.link}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card title="Your donors">
            {all.paid_count === 0 ? (
              <p className="text-sm text-muted">These fill in once donations start coming in.</p>
            ) : (
              <>
                <ul className="grid grid-cols-2 gap-2">
                  {donorGroups.map((g) => (
                    <li key={g.key}>
                      <Link href={`${base}/donors?group=${g.key}`} className="block rounded-control border-2 border-border p-3 transition hover:border-brand">
                        <span className="block font-display text-2xl text-indigo">{groups[g.key]}</span>
                        <span className="block text-sm font-semibold">{g.label}</span>
                        <span className="block text-xs text-muted">{g.hint}</span>
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
                      <span className="text-muted"> ({plural(giftsTotal, "donation")} from {plural(donors.length, "donor")}, all time)</span>.
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

          {top.length > 0 ? (
            <Card title="Your biggest supporters">
              <ol className="space-y-2 text-sm">
                {top.map((d, i) => (
                  <li key={d.donor_id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate"><span className="text-muted">{i + 1}.</span> {isErasedEmail(d.email) ? ERASED_DONOR : d.display_name}</span>
                    <span className="shrink-0">{formatRand(d.total_cents)} <span className="text-muted">({plural(d.donation_count, "donation")})</span></span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">All-time totals. A personal thank-you goes a long way.</p>
              <Link href={`${base}/donors`} className="mt-2 inline-block text-sm text-brand underline">All donors</Link>
            </Card>
          ) : null}

          <Card title="Campaigns">
            {activeCampaigns.length ? (
              <ul className="space-y-3 text-sm">
                {activeCampaigns.map((c) => {
                  const pct = progressPercent(c.raisedCents, c.targetCents);
                  return (
                    <li key={c.id}>
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">{c.title}</span>
                        <span>{formatRand(c.raisedCents)}{c.targetCents ? <span className="text-muted"> of {formatRand(c.targetCents)}</span> : null}</span>
                      </div>
                      {c.targetCents ? (
                        <>
                          <div className="mt-2 h-3 rounded-full bg-brand-soft" aria-hidden>
                            <div className="h-3 rounded-full bg-coral" style={{ width: `${Math.max(2, pct)}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted">
                            {pct}% of the goal{c.endsAt ? `, ends ${formatDate(c.endsAt)}` : ""}
                          </p>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Raising for something specific, like winter food parcels? Start a campaign with a goal, and donors see how close you are.</p>
            )}
            <Link href={`${base}/campaigns`} className="mt-3 inline-block text-sm text-brand underline">{activeCampaigns.length ? "Manage campaigns" : "Start a campaign"}</Link>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Donations by month">
            {!anyGifts ? (
              <p className="text-sm text-muted">No paid donations in the last 12 months. They appear here once the first one comes in.</p>
            ) : (
              <>
                <div className="mb-3 flex gap-4 text-xs text-muted" aria-hidden>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Monthly</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-honey" />Once-off</span>
                </div>
                {/* Bars for the eye; the list underneath is what screen readers read. */}
                <div className="flex h-48 items-end gap-1.5" aria-hidden>
                  {chart.map((m) => {
                    const h = Math.round((m.amountCents / max) * 100);
                    const monthlyShare = m.amountCents ? Math.round((m.monthlyCents / m.amountCents) * 100) : 0;
                    const current = m.month.slice(0, 7) === today.slice(0, 7);
                    return (
                      <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                        <div
                          title={`${formatRand(m.amountCents)}, ${plural(m.donationCount, "donation")}`}
                          className={`flex w-full flex-col-reverse overflow-hidden rounded-t-lg ${current ? "ring-2 ring-coral ring-offset-1" : ""}`}
                          style={{ height: m.amountCents ? `${Math.max(3, h)}%` : "2px" }}
                        >
                          <div className="w-full bg-brand" style={{ height: `${monthlyShare}%` }} />
                          <div className={`w-full flex-1 ${m.amountCents ? "bg-honey" : "bg-border"}`} />
                        </div>
                        <span className={`text-[11px] ${current ? "font-semibold text-indigo" : "text-muted"}`}>{m.month.slice(5, 7)}</span>
                      </div>
                    );
                  })}
                </div>
                <ul className="mt-4 space-y-1 text-sm">
                  {[...chart].reverse().filter((m) => m.amountCents > 0).map((m) => {
                    const [y, mm] = m.month.split("-");
                    return (
                      <li key={m.month} className="flex justify-between gap-3">
                        <span>{mm}/{y}</span>
                        <span>
                          {formatRand(m.amountCents)} <span className="text-muted">({plural(m.donationCount, "donation")}{m.monthlyCents ? `, ${formatRand(m.monthlyCents)} monthly` : ""})</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>

          <MonthlyTrend rows={recurring} now={now} seeAllHref={`${base}/monthly`} />

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
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`${base}/poster`} className="rounded-full border-2 border-border bg-surface px-4 py-2 font-semibold text-brand hover:border-brand">Print a QR poster</Link>
        <a href={`${base}/export/donations`} className="rounded-full border-2 border-border bg-surface px-4 py-2 font-semibold text-brand hover:border-brand">Download paid donations (CSV)</a>
      </div>
    </div>
  );
}
