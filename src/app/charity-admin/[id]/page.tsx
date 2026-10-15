import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { loadCharityForManager } from "@/lib/charity/queries";
import { allTime, averageCents, monthlySummary, repeatPercent, thisMonth, thisTaxYear } from "@/lib/charity/dashboard";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { progressPercent } from "@/lib/charity/campaigns";
import { loadInsights, loadMonthlyDonations, loadMonthlyTotals, loadOverview } from "@/lib/charity/dashboard-queries";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function CharityDashboardPage({ params }: PageProps<"/charity-admin/[id]">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}`);
  const { charity } = await loadCharityForManager(id);
  const base = `/charity-admin/${id}`;

  if (charity.status !== "approved") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{charity.name_en}</h1>
        <Notice tone="warning">
          Donations start once your application is approved.{" "}
          <Link href={`${base}/application`} className="underline">Go to your registration details</Link>.
        </Notice>
      </div>
    );
  }

  const now = new Date();
  const taxYear = thisTaxYear(now);
  const [month, year, all, monthly, recurring, insights, campaigns] = await Promise.all([
    loadOverview(id, thisMonth(now)),
    loadOverview(id, taxYear),
    loadOverview(id, allTime),
    loadMonthlyTotals(id, 12),
    loadMonthlyDonations(id),
    loadInsights(id, thisMonth(now)),
    loadCampaigns(id),
  ]);
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const regular = monthlySummary(recurring);
  const receipts = canIssue18a(charity);
  const chart = [...monthly].reverse();
  const max = Math.max(1, ...chart.map((m) => m.amountCents));
  // Only what the charity can open in its donations list (unpaid attempts are not shown to charities).
  const attention = all.refunded_count + all.charged_back_count;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{charity.name_en}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="This month" value={formatRand(month.paid_cents)} note={plural(month.paid_count, "donation")} />
        <Stat label={`Tax year ${taxYear.taxYear}`} value={formatRand(year.paid_cents)} note={plural(year.paid_count, "donation")} />
        <Stat label="All time" value={formatRand(all.paid_cents)} note={plural(all.paid_count, "donation")} />
        <Stat label="Donors" value={String(all.donor_count)} note="who have given" />
      </div>
      <p className="text-xs text-muted">
        Amounts are the donations only. Any contribution a donor chose to add for Givezy is not included.
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

      <Card title="Your donors">
        {all.paid_count === 0 ? (
          <p className="text-sm text-muted">These fill in once donations start coming in.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-semibold">{plural(insights.newDonors, "new donor")}</span> this month
              {insights.returningDonors ? <>, and {plural(insights.returningDonors, "donor")} who gave before came back</> : null}.
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
                    <div className="mt-1 h-2 rounded-full bg-honey-soft" aria-hidden>
                      <div className="h-2 rounded-full bg-honey" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Raising for something specific, like Pesach parcels? Start a campaign with a goal, and donors see how close you are.</p>
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

      <Card title="Donations by month">
        {chart.length === 0 ? (
          <p className="text-sm text-muted">No paid donations yet. They appear here once the first one comes in.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {chart.map((m) => {
              const [y, mm] = m.month.split("-");
              return (
                <li key={m.month}>
                  <div className="flex justify-between gap-3">
                    <span>{mm}/{y}</span>
                    <span>{formatRand(m.amountCents)} <span className="text-muted">({plural(m.donationCount, "donation")})</span></span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-honey-soft" aria-hidden>
                    <div className="h-2 rounded-full bg-honey" style={{ width: `${Math.max(2, Math.round((m.amountCents / max) * 100))}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`${base}/donations`} className="rounded-control border border-border px-3 py-2">Donations</Link>
        <Link href={`${base}/donors`} className="rounded-control border border-border px-3 py-2">Donors</Link>
        <Link href={`${base}/monthly`} className="rounded-control border border-border px-3 py-2">Monthly</Link>
        <Link href={`${base}/receipts`} className="rounded-control border border-border px-3 py-2">Receipts</Link>
        <a href={`${base}/export/donations`} className="rounded-control border border-border px-3 py-2">Download donations (CSV)</a>
      </div>
    </div>
  );
}
