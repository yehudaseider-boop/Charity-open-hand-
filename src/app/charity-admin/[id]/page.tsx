import type { Metadata } from "next";
import Link from "next/link";
import { SupportContact } from "@/components/legal";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { gettingStarted } from "@/lib/charity/checklist";
import { loadCharityForManager, loadStories } from "@/lib/charity/queries";
import { CopyLink } from "./copy-link";
import { allTime, averageCents, monthlySummary, repeatPercent, thisMonth, thisTaxYear } from "@/lib/charity/dashboard";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { isRunning, progressPercent } from "@/lib/charity/campaigns";
import { loadInsights, loadMonthlyDonations, loadMonthlyTotals, loadOverview } from "@/lib/charity/dashboard-queries";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, note, strong = false }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={`rounded-card p-5 ${strong ? "bg-indigo text-white" : "bg-honey-soft"}`}>
      <p className={`text-sm font-medium ${strong ? "text-honey" : "text-muted"}`}>{label}</p>
      <p className="mt-1 font-display text-3xl leading-tight">{value}</p>
      {note ? <p className={`mt-1 text-sm ${strong ? "text-white/80" : "text-muted"}`}>{note}</p> : null}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function CharityDashboardPage({ params }: PageProps<"/charity-admin/[id]">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}`);
  const { charity } = await loadCharityForManager(id);
  const base = `/charity-admin/${id}`;

  if (charity.status === "suspended") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-indigo">{charity.name_en}</h1>
        <Notice tone="danger">
          <p className="font-medium">Your page is paused</p>
          <p className="mt-1">While it is paused, your page is hidden and donors can&apos;t give to you. Monthly donations aren&apos;t collected. Your past donations and receipts are kept.</p>
          {charity.rejection_reason ? <p className="mt-2 whitespace-pre-line">The reason: {charity.rejection_reason}</p> : null}
          <p className="mt-2">To sort this out, <SupportContact />.</p>
        </Notice>
        <p className="text-sm">
          <Link href={`${base}/donations`} className="text-brand underline">Your donations</Link>
          {" · "}
          <Link href={`${base}/receipts`} className="text-brand underline">Receipts</Link>
        </p>
      </div>
    );
  }
  if (charity.status !== "approved") {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-indigo">{charity.name_en}</h1>
        <Notice tone="warning">
          Donations start once your application is approved.{" "}
          <Link href={`${base}/application`} className="underline">Go to your registration details</Link>.
        </Notice>
      </div>
    );
  }

  const now = new Date();
  const taxYear = thisTaxYear(now);
  const [month, year, all, monthly, recurring, insights, campaigns, stories] = await Promise.all([
    loadOverview(id, thisMonth(now)),
    loadOverview(id, taxYear),
    loadOverview(id, allTime),
    loadMonthlyTotals(id, 12),
    loadMonthlyDonations(id),
    loadInsights(id, thisMonth(now)),
    loadCampaigns(id),
    loadStories(id, 1),
  ]);
  const activeCampaigns = campaigns.filter((c) => isRunning(c, now));
  const start = gettingStarted(charity, { updates: stories.updates.length, campaigns: campaigns.length }, base);
  const startDone = start.filter((i) => i.done).length;
  const publicLink = `${(process.env.SITE_URL ?? "").replace(/\/+$/, "")}/c/${charity.slug}`;
  const regular = monthlySummary(recurring);
  const receipts = canIssue18a(charity);
  const chart = [...monthly].reverse();
  const max = Math.max(1, ...chart.map((m) => m.amountCents));
  // Only what the charity can open in its donations list (unpaid attempts are not shown to charities).
  const attention = all.refunded_count + all.charged_back_count;

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
            <CopyLink url={publicLink} />
            <Link href={`${base}/poster`} className="mt-2 inline-block text-brand underline">Print a QR poster for your notice board</Link>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat strong label="This month" value={formatRand(month.paid_cents)} note={plural(month.paid_count, "donation")} />
        <Stat label={`Tax year ${taxYear.taxYear}`} value={formatRand(year.paid_cents)} note={plural(year.paid_count, "donation")} />
        <Stat label="All time" value={formatRand(all.paid_cents)} note={plural(all.paid_count, "donation")} />
        <Stat label="Donors" value={String(all.donor_count)} note="who have given" />
      </div>
      <p className="text-xs text-muted">
        Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included. The payment provider&apos;s card fee comes off each donation before it reaches your bank.
        {" "}{taxYearLabel(taxYear.taxYear)}.
      </p>

      {attention > 0 ? (
        <Card title="Worth a look">
          <ul className="space-y-1 text-sm">
            {all.refunded_count > 0 ? <li>{plural(all.refunded_count, "donation")} refunded ({formatRand(all.refunded_cents)})</li> : null}
            {all.charged_back_count > 0 ? <li>{plural(all.charged_back_count, "donation")} charged back</li> : null}
          </ul>
          <Link href={`${base}/donations`} className="mt-3 inline-block text-sm text-brand underline">See all donations</Link>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
      <Card title="Your donors">
        {all.paid_count === 0 ? (
          <p className="text-sm text-muted">These fill in once donations start coming in.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-semibold">{plural(insights.newDonors, "new donor")}</span> this month
              {insights.returningDonors ? <>, and {plural(insights.returningDonors, "donor")} who gave before came back</> : null}.{" "}
              <Link href={`${base}/thank-donors`} className="text-brand underline">Thank them</Link>
            </li>
            <li>
              <span className="font-semibold">{repeatPercent(insights.repeatDonors, insights.allDonors)}%</span> of your donors have given more than once
              <span className="text-muted"> ({insights.repeatDonors} of {insights.allDonors})</span>.
            </li>
            <li>
              The average gift this tax year is <span className="font-semibold">{formatRand(averageCents(year.paid_cents, year.paid_count))}</span>
              <span className="text-muted"> ({plural(year.paid_count, "gift")})</span>.
            </li>
          </ul>
        )}
      </Card>

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
                    <p className="mt-1 text-xs text-muted">{pct}% of the goal</p>
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

      <Card title="Monthly donations">
        {recurring.length === 0 ? (
          <p className="text-sm text-muted">No monthly donors yet. Donors can choose to give every month when they donate.</p>
        ) : (
          <p className="text-sm">
            {plural(regular.runningCount, "donor")} {regular.runningCount === 1 ? "gives" : "give"} {formatRand(regular.runningCentsPerMonth)} a month in total
            {regular.pausedCount > 0 ? `, ${regular.pausedCount} paused` : ""}.{" "}
            <Link href={`${base}/monthly`} className="text-brand underline">See monthly donations</Link>
          </p>
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
        <div className="space-y-5">
      <Card title="Donations by month">
        {chart.length === 0 ? (
          <p className="text-sm text-muted">No paid donations yet. They appear here once the first one comes in.</p>
        ) : (
          <>
            {/* Bars for the eye; the list underneath is what screen readers read. */}
            <div className="flex h-48 items-end gap-1.5" aria-hidden>
              {chart.map((m, i) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div
                    title={`${formatRand(m.amountCents)}, ${plural(m.donationCount, "donation")}`}
                    className={`w-full rounded-t-lg ${i === chart.length - 1 ? "bg-coral" : "bg-brand"}`}
                    style={{ height: `${Math.max(3, Math.round((m.amountCents / max) * 100))}%` }}
                  />
                  <span className="text-[11px] text-muted">{m.month.split("-")[1]}</span>
                </div>
              ))}
            </div>
            <ul className="mt-4 space-y-1 text-sm">
              {[...chart].reverse().map((m) => {
                const [y, mm] = m.month.split("-");
                return (
                  <li key={m.month} className="flex justify-between gap-3">
                    <span>{mm}/{y}</span>
                    <span>{formatRand(m.amountCents)} <span className="text-muted">({plural(m.donationCount, "donation")})</span></span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`${base}/donations`} className="rounded-full border border-border bg-surface px-4 py-2 font-medium text-brand hover:bg-brand-soft">Donations</Link>
        <Link href={`${base}/donors`} className="rounded-full border border-border bg-surface px-4 py-2 font-medium text-brand hover:bg-brand-soft">Donors</Link>
        <Link href={`${base}/monthly`} className="rounded-full border border-border bg-surface px-4 py-2 font-medium text-brand hover:bg-brand-soft">Monthly</Link>
        <Link href={`${base}/receipts`} className="rounded-full border border-border bg-surface px-4 py-2 font-medium text-brand hover:bg-brand-soft">Receipts</Link>
        <Link href={`${base}/poster`} className="rounded-full border border-border bg-surface px-4 py-2 font-medium text-brand hover:bg-brand-soft">QR poster</Link>
        <a href={`${base}/export/donations`} className="rounded-full border border-border bg-surface px-4 py-2 font-medium text-brand hover:bg-brand-soft">Download donations (CSV)</a>
      </div>
    </div>
  );
}
