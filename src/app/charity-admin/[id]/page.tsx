import type { Metadata } from "next";
import Link from "next/link";
import { SupportContact } from "@/components/legal";
import { Notice } from "@/components/card";
import { OverviewView } from "./overview-view";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { gettingStarted } from "@/lib/charity/checklist";
import { loadCharityForManager, loadStories } from "@/lib/charity/queries";
import { allTime, lastMonth, monthlySummary, saDate, thisMonth, thisTaxYear } from "@/lib/charity/dashboard";
import { countDonorGroups, donorGroupsFor, endsWithinAWeek, giftsPerDonor, lapsedPeriodText, lastMonths, monthlyAttention, topDonors } from "@/lib/charity/insights";
import { dueReminders, lapsedDaysFor } from "@/lib/charity/donor-care";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { isRunning, progressPercent } from "@/lib/charity/campaigns";
import { loadDonors, loadGiftSources, loadInsights, loadMonthlyDonations, loadMonthlyTotals, loadOverview, loadRecentDonations } from "@/lib/charity/dashboard-queries";
import { formatDate, isoDateInJhb } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { impactUnitFrom } from "@/lib/charity/impact";

export const metadata: Metadata = { title: "Overview" };

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
  const [month, prev, year, all, monthly, recurring, insights, campaigns, stories, donors, recent, sources] = await Promise.all([
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
    loadRecentDonations(id, 7),
    loadGiftSources(id, taxYear),
  ]);
  const [lapsedDays, due] = await Promise.all([lapsedDaysFor(id), dueReminders(id, isoDateInJhb(now))]);
  const donorGroups = donorGroupsFor(lapsedDays);
  const activeCampaigns = campaigns.filter((c) => isRunning(c, now));
  const start = gettingStarted(charity, { updates: stories.updates.length, campaigns: campaigns.length }, base);
  const publicLink = `${(process.env.SITE_URL ?? "").replace(/\/+$/, "")}/c/${charity.slug}`;
  const regular = monthlySummary(recurring);
  const receipts = canIssue18a(charity);
  const today = saDate(now);
  const chart = lastMonths(monthly, today, 12);
  const groups = countDonorGroups(donors, now, lapsedDays);
  const unit = impactUnitFrom(charity);
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

  return (
    <OverviewView
      charityName={charity.name_en}
      base={base}
      now={now}
      publicLink={publicLink}
      month={month}
      prev={prev}
      year={year}
      all={all}
      taxYear={taxYear}
      chart={chart}
      recurring={recurring}
      regular={regular}
      sources={sources}
      recent={recent}
      campaigns={campaigns}
      activeCampaigns={activeCampaigns}
      start={start}
      groups={groups}
      donorGroups={donorGroups}
      insights={insights}
      donorCount={donors.length}
      top={top}
      giftsTotal={giftsTotal}
      perDonor={perDonor}
      unit={unit}
      receipts={receipts}
      todo={todo}
    />
  );
}
