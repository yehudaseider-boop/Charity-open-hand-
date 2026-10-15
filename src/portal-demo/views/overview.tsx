"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { showMonth } from "../data/day";
import {
  campaignStats,
  canCompare,
  changeTenths,
  dayOf,
  inRange,
  donorName,
  financeSummary,
  firstGiftDays,
  monthlySeries,
  pendingSettlement,
  presetRange,
  previousRange,
  RANGE_LABELS,
  recurringSummary,
  sameDaysLastMonth,
  summarise,
  visibleToCharity,
} from "../data/selectors";
import type { DemoDataset, Donation } from "../data/types";
import { usePortal } from "../store";
import { BarChart } from "../ui/charts";
import { DateRangePicker } from "../ui/date-range";
import { count, date, permille, rand, randShort, randWhole } from "../ui/format";
import { Icon, type IconName } from "../ui/icons";
import { MetricCard } from "../ui/metric";
import { Avatar, ButtonLink, Card, CardHeader, cx, PageHeader, Progress } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { AttentionCard } from "./attention";
import { campaignName, DonationDrawer, DonationStatusBadge, donationCsvRows, Loaded, useExport, useLookups } from "./common";

export function OverviewView() {
  return <Loaded>{(data) => <Overview data={data} />}</Loaded>;
}

function Overview({ data }: { data: DemoDataset }) {
  const { range, rangePreset, toast } = usePortal();
  const lookups = useLookups(data);
  const exportCsv = useExport();
  const [open, setOpen] = useState<Donation | null>(null);

  const m = useMemo(() => {
    const firsts = firstGiftDays(data);
    const now = summarise(data, range, firsts);
    const before = canCompare(range) ? summarise(data, previousRange(range), firsts) : null;
    const month = presetRange("month");
    const thisMonth = summarise(data, month, firsts);
    const lastMonth = summarise(data, sameDaysLastMonth(month), firsts);
    const series = monthlySeries(data, range, firsts);
    return { now, before, thisMonth, lastMonth, series, rec: recurringSummary(data, range), fin: financeSummary(data, range), pending: pendingSettlement(data) };
  }, [data, range]);

  const campaigns = useMemo(() => campaignStats(data).filter((c) => c.status === "active").sort((a, b) => b.raisedCents - a.raisedCents), [data]);
  const recent = data.donations.filter(visibleToCharity).slice(0, 7);
  const owner = data.team.find((t) => t.role === "owner");
  const labels = m.series.map((p) => showMonth(p.key, m.series.length > 6));

  return (
    <div className="gz-fade-in space-y-6">
      <div className="relative overflow-hidden rounded-[28px] bg-gz-lilac-soft px-6 py-6 sm:px-8">
        {/* The Givezy splash (all three shapes, cut from the logo): this screen's one orange accent. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/givezy/logo-splash.png" alt="" aria-hidden width={128} height={90} className="pointer-events-none absolute -bottom-5 right-6 hidden w-28 opacity-90 md:block" />
        <PageHeader
          title={`Hello, ${owner?.name.split(" ")[0] ?? "there"}`}
          subtitle={
            <>
              Here is how giving to <strong className="font-semibold text-gz-ink">{data.charity.name}</strong> is going. Showing {RANGE_LABELS[rangePreset].toLowerCase()}.
            </>
          }
          actions={<DateRangePicker />}
        />
        <div className="-mt-2 flex flex-wrap gap-2">
          <ButtonLink href={`${BASE}/campaigns/new`} icon="plus" size="sm">
            New campaign
          </ButtonLink>
          <ButtonLink href={`${BASE}/donations`} variant="secondary" size="sm" icon="donations">
            See all donations
          </ButtonLink>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard highlight label="Total donations" icon="donations" value={randWhole(m.now.raisedCents)} delta={m.before && changeTenths(m.now.raisedCents, m.before.raisedCents)} note={`${count(m.now.donationCount)} paid donations`} />
        <MetricCard label="This month" icon="calendar" value={randWhole(m.thisMonth.raisedCents)} delta={changeTenths(m.thisMonth.raisedCents, m.lastMonth.raisedCents)} deltaLabel="vs same days last month" trend={m.series.map((p) => p.raisedCents)} />
        <MetricCard label="Donors" icon="users" value={count(m.now.donorCount)} delta={m.before && changeTenths(m.now.donorCount, m.before.donorCount)} note={`${count(m.now.newDonors)} new · ${count(m.now.returningDonors)} returning`} trend={m.series.map((p) => p.newDonors + p.returningDonors)} trendColour="lilac" />
        <MetricCard label="Active monthly donations" icon="repeat" value={count(m.rec.active)} note={`${rand(m.rec.expectedMonthlyCents)} expected each month`} trend={m.series.map((p) => p.monthlyCents)} trendColour="sage" />
      </div>

      <AttentionCard data={data} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Donations by month" subtitle="Paid donations, once-off and monthly. Tap a bar for the figures." action={<ButtonLink href={`${BASE}/analytics`} variant="ghost" size="sm">Analytics</ButtonLink>} />
          <BarChart
            stacked
            labels={labels}
            tipLabels={m.series.map((p) => showMonth(p.key))}
            series={[
              { name: "Once-off", colour: "blue", values: m.series.map((p) => p.onceCents) },
              { name: "Monthly", colour: "lilac", values: m.series.map((p) => p.monthlyCents) },
            ]}
            format={rand}
            axisFormat={randShort}
            height={260}
          />
        </Card>

        <Card>
          <CardHeader title="Money check" subtitle="Donations made in this period" action={<ButtonLink href={`${BASE}/finances`} variant="ghost" size="sm">Finances</ButtonLink>} />
          <dl className="space-y-2.5 text-sm">
            <Row label="Gross donations" value={rand(m.fin.grossCents)} />
            <Row label="Refunds" value={`− ${rand(m.fin.refundsCents)}`} />
            <Row label="Processing fees" value={`− ${rand(m.fin.processingFeesCents)}`} hint="placeholder rate" />
            <Row label="Givezy platform fee" value="R0" />
            <div className="border-t border-gz-hairline pt-2.5">
              <Row label="Net to your charity" value={rand(m.fin.netCents)} strong />
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Pill label="Paid out" value={randShort(m.fin.paidOutCents)} tone="success" />
            <Pill label="On its way" value={randShort(m.fin.inTransitCents)} tone="info" />
            <Pill label="Not paid out yet" value={randShort(m.fin.awaitingCents)} tone="warning" />
          </div>
          <p className="mt-3 text-xs text-gz-muted">
            Next payout carries {rand(m.pending.netCents)} so far. Amounts by gross donation.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Active campaigns" subtitle="Raised against each goal, all time" action={<ButtonLink href={`${BASE}/campaigns`} variant="ghost" size="sm">All campaigns</ButtonLink>} />
          {campaigns.length ? (
            <ul className="divide-y divide-gz-hairline">
              {campaigns.slice(0, 4).map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <Link href={`${BASE}/campaigns/${c.id}`} className="group block">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-gz-ink group-hover:text-gz-blue">{c.name}</span>
                      <span className="text-sm">
                        <strong>{randWhole(c.raisedCents)}</strong> <span className="text-gz-muted">of {randWhole(c.goalCents)}</span>
                      </span>
                    </div>
                    <Progress permille={c.progressPermille} className="mt-2" label={`${c.name} progress`} />
                    <p className="mt-1.5 text-xs text-gz-muted">
                      {permille(c.progressPermille)} · {count(c.donorCount)} donors · {c.endDate ? `ends ${date(`${c.endDate}T12:00:00Z`)}` : "no end date"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gz-muted">No active campaigns. <Link className="font-semibold text-gz-blue" href={`${BASE}/campaigns/new`}>Start one</Link>.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <div className="grid grid-cols-2 gap-2.5">
            <QuickAction href={`${BASE}/campaigns/new`} icon="plus" label="Create a campaign" />
            <QuickAction
              icon="download"
              label="Export donations"
              onClick={() => {
                const rows = data.donations.filter((d) => visibleToCharity(d) && inRange(dayOf(d), range));
                const { header, body } = donationCsvRows(rows, lookups);
                exportCsv("donations", header, body);
              }}
            />
            <QuickAction
              icon="link"
              label="Copy a campaign link"
              onClick={() => {
                const c = campaigns[0];
                const link = `https://givezy.example/c/${data.charity.publicSlug}${c ? `/${c.slug}` : ""}`;
                navigator.clipboard?.writeText(link).catch(() => undefined);
                toast({ tone: "success", title: "Link copied (demo address)", body: link });
              }}
            />
            <QuickAction href={`${BASE}/settings?tab=team`} icon="userPlus" label="Invite a team member" />
          </div>
          <div className="mt-4 rounded-2xl bg-gz-cream p-3.5 text-sm">
            <p className="font-semibold">{rand(m.now.reversedCents)} refunded or charged back</p>
            <p className="mt-0.5 text-gz-muted">Donations made in this period and later reversed. Not counted in your totals. <Link href={`${BASE}/donations?status=reversed`} className="inline-flex min-h-10 items-center font-semibold text-gz-blue">See them</Link></p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Latest donations" subtitle="The newest first. Open one for its full details." action={<ButtonLink href={`${BASE}/donations`} variant="ghost" size="sm">See all</ButtonLink>} />
        <ul className="divide-y divide-gz-hairline">
          {recent.map((d) => {
            const donor = lookups.donor.get(d.donorId);
            return (
              <li key={d.id}>
                <button type="button" onClick={() => setOpen(d)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-gz-blue-soft/20">
                  <Avatar name={donorName(donor)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{donorName(donor)}</span>
                    <span className="block truncate text-xs text-gz-muted">
                      {campaignName(d.campaignId, lookups.campaign)} · {d.kind === "monthly" ? "Monthly" : "Once-off"} · {date(d.donatedAt)}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    <DonationStatusBadge status={d.status} />
                  </span>
                  <span className="w-24 text-right font-semibold">{rand(d.amountCents)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <DonationDrawer donation={open} onClose={() => setOpen(null)} data={data} />
    </div>
  );
}

function Row({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cx(strong ? "font-semibold text-gz-ink" : "text-gz-muted")}>
        {label}
        {hint && <span className="ml-1 text-[11px] text-gz-muted">({hint})</span>}
      </dt>
      <dd className={cx("whitespace-nowrap font-semibold", strong ? "text-lg text-gz-blue" : "text-gz-ink")}>{value}</dd>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "warning" }) {
  const t = { success: "bg-gz-success-soft text-gz-success", info: "bg-gz-blue-soft text-gz-blue", warning: "bg-gz-warning-soft text-gz-warning" }[tone];
  return (
    <div className={cx("rounded-2xl px-2 py-2.5", t)}>
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[11px] font-medium">{label}</p>
    </div>
  );
}

function QuickAction({ href, onClick, icon, label }: { href?: string; onClick?: () => void; icon: IconName; label: string }) {
  const cls = "flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border border-gz-hairline bg-gz-cream p-3.5 text-left text-sm font-semibold text-gz-ink transition-colors hover:border-gz-blue/40 hover:bg-gz-blue-soft/40";
  const inner = (
    <>
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-gz-surface text-gz-blue shadow-sm">
        <Icon name={icon} size={18} />
      </span>
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
