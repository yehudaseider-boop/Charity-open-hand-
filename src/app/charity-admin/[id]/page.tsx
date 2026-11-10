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
import { isRunning } from "@/lib/charity/campaigns";
import { loadDonors, loadGiftSources, loadInsights, loadMonthlyDonations, loadMonthlyTotals, loadOverview, loadRecentDonations } from "@/lib/charity/dashboard-queries";
import { isoDateInJhb } from "@/lib/dates";
import { impactUnitFrom } from "@/lib/charity/impact";
import { keepingWindow } from "@/lib/charity/keeping-donors";
import { lapsedPeriod } from "@/lib/charity/lapsed-monthly";
import { loadLapsedMonthly } from "@/lib/charity/lapsed-monthly-queries";
import { loadS18aMissing } from "@/lib/charity/s18a-reminder-send";
import { thisWeek } from "@/lib/charity/this-week";
import { newDonorsToThank } from "@/lib/charity/this-week-store";
import { KeepingNotSetUp, loadKeepingSummary } from "@/lib/charity/keeping-donors-queries";

export const metadata: Metadata = { title: "Overview" };

/** One part of "Needs you this week" couldn't be read: log it (no donor details) and let the card say so. */
function quiet(what: string, e: unknown): null {
  console.error(`[overview] ${what} couldn't load`, e instanceof Error ? e.message : e);
  return null;
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
  const keepingYear = keepingWindow("this", now);
  // "Needs you this week" (CRM step 17): each line links to the page where the charity acts on it. Unpaid attempts
  // are not shown to charities. A part that can't be read is named on the card; the rest still shows.
  const [lapsedDays, due, keepingRows, toThank, stopped, s18aMissing] = await Promise.all([
    lapsedDaysFor(id),
    dueReminders(id, isoDateInJhb(now)),
    // A bonus panel: if it can't load, the overview still shows, with a plain line instead. Not set up yet: no panel.
    loadKeepingSummary(id, keepingYear).catch((e) => (e instanceof KeepingNotSetUp ? undefined : null)),
    newDonorsToThank(id, donors, now).catch((e: unknown) => quiet("new donors to thank", e)),
    loadLapsedMonthly(id, lapsedPeriod("30-days", now)).then(
      (rows) => ({ count: rows.length, centsPerMonth: rows.reduce((t, r) => t + Number(r.amount_cents), 0) }),
      (e: unknown) => quiet("stopped monthly donors", e),
    ),
    // Anyone who manages the charity sees the count; only the owner can send the reminder from the Donors list.
    loadS18aMissing(id, now).then((m) => m.size, (e: unknown) => quiet("s18A details", e)),
  ]);
  const keeping = keepingRows === undefined ? undefined : keepingRows === null ? null : { summary: keepingRows, window: keepingYear };
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
  const week = thisWeek({
    base,
    todaySa: isoDateInJhb(now),
    toThank,
    monthly: needs,
    stopped,
    s18aMissing,
    lapsed: { count: groups.lapsed, periodText: lapsedPeriodText(lapsedDays) },
    followUps: due,
    endingSoon,
    refunded: { count: all.refunded_count, cents: all.refunded_cents },
    chargedBack: all.charged_back_count,
  });

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
      todo={week.items}
      todoUnavailable={week.unavailable}
      keeping={keeping}
    />
  );
}
