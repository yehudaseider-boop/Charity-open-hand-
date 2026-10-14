"use client";

import { useMemo, useState } from "react";
import { showMonth } from "../data/day";
import { amountDistribution, canCompare, changeTenths, dayOf, firstGiftDays, inRange, monthlySeries, previousRange, RANGE_LABELS, recurringSeries, summarise } from "../data/selectors";
import type { DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { BarChart, BarList, LineChart } from "../ui/charts";
import { DateRangePicker } from "../ui/date-range";
import { count, permille, rand, randShort, randWhole } from "../ui/format";
import { MetricCard } from "../ui/metric";
import { Card, CardHeader, PageHeader, Segmented } from "../ui/primitives";
import { campaignName, Loaded, useLookups } from "./common";

export function AnalyticsView() {
  return <Loaded>{(data) => <Analytics data={data} />}</Loaded>;
}

function Analytics({ data }: { data: DemoDataset }) {
  const { range, rangePreset } = usePortal();
  const lookups = useLookups(data);
  const [growth, setGrowth] = useState<"month" | "running">("month");
  const [dist, setDist] = useState<"count" | "value">("count");

  const a = useMemo(() => {
    const firsts = firstGiftDays(data);
    const now = summarise(data, range, firsts);
    const before = canCompare(range) ? summarise(data, previousRange(range), firsts) : null;
    const series = monthlySeries(data, range, firsts);
    const paid = data.donations.filter((d) => d.status === "paid" && inRange(dayOf(d), range));
    // Given by donors whose first ever donation fell in this period, against everyone else.
    let firstTimeCents = 0;
    for (const d of paid) if (inRange(firsts.get(d.donorId) ?? "", range)) firstTimeCents += d.amountCents;
    const byCampaign = new Map<string, { cents: number; donors: Set<string> }>();
    for (const d of paid) {
      const k = d.campaignId ?? "general";
      const e = byCampaign.get(k) ?? { cents: 0, donors: new Set() };
      e.cents += d.amountCents;
      e.donors.add(d.donorId);
      byCampaign.set(k, e);
    }
    const app = paid.filter((d) => d.channel === "app").reduce((s, d) => s + d.amountCents, 0);
    return { now, before, series, firstTimeCents, byCampaign, app, rec: recurringSeries(data, range), dist: amountDistribution(data, range) };
  }, [data, range]);

  const labels = a.series.map((p) => showMonth(p.key, a.series.length > 6));
  const tips = a.series.map((p) => showMonth(p.key));
  let run = 0;
  const running = a.series.map((p) => (run += p.raisedCents));

  return (
    <div className="gz-fade-in space-y-6">
      <PageHeader title="Analytics" subtitle={`How giving is growing, who is giving and how. ${RANGE_LABELS[rangePreset]}, compared with the period before when the demo has it.`} actions={<DateRangePicker />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Raised" icon="donations" value={randWhole(a.now.raisedCents)} delta={a.before ? changeTenths(a.now.raisedCents, a.before.raisedCents) : null} trend={a.series.map((p) => p.raisedCents)} />
        <MetricCard label="Donations" icon="receipt" value={count(a.now.donationCount)} delta={a.before ? changeTenths(a.now.donationCount, a.before.donationCount) : null} />
        <MetricCard label="Average donation" icon="chart" value={rand(a.now.averageCents)} delta={a.before ? changeTenths(a.now.averageCents, a.before.averageCents) : null} />
        <MetricCard label="Donors" icon="users" value={count(a.now.donorCount)} delta={a.before ? changeTenths(a.now.donorCount, a.before.donorCount) : null} trend={a.series.map((p) => p.newDonors + p.returningDonors)} trendColour="lilac" />
      </div>

      <Card>
        <CardHeader
          title="Donation growth"
          subtitle="Paid donations by month"
          action={<Segmented label="Show" size="sm" value={growth} onChange={setGrowth} options={[{ value: "month", label: "Each month" }, { value: "running", label: "Running total" }]} />}
        />
        <LineChart labels={labels} tipLabels={tips} series={[{ name: growth === "month" ? "Raised" : "Running total", colour: "blue", values: growth === "month" ? a.series.map((p) => p.raisedCents) : running }]} format={rand} axisFormat={randShort} height={280} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Donor growth" subtitle="Everyone who has ever given, at the end of each month" />
          <LineChart labels={labels} tipLabels={tips} series={[{ name: "Donors to date", colour: "lilac", values: a.series.map((p) => p.cumulativeDonors) }]} format={count} axisFormat={count} height={240} />
        </Card>
        <Card>
          <CardHeader title="First-time and returning donors" subtitle="Donors who gave each month. First-time: their first ever donation was that month." />
          <BarChart
            stacked
            labels={labels}
            tipLabels={tips}
            series={[
              { name: "Returning", colour: "blue", values: a.series.map((p) => p.returningDonors) },
              { name: "First-time", colour: "lilac", values: a.series.map((p) => p.newDonors) },
            ]}
            format={count}
            axisFormat={count}
            height={240}
          />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="bg-gz-lilac-soft">
          <CardHeader title="First-time against returning" subtitle="In this period" />
          <dl className="space-y-4">
            <Split label="First-time donors" donors={a.now.newDonors} total={a.now.donorCount} cents={a.firstTimeCents} raised={a.now.raisedCents} />
            <Split label="Returning donors" donors={a.now.returningDonors} total={a.now.donorCount} cents={a.now.raisedCents - a.firstTimeCents} raised={a.now.raisedCents} />
          </dl>
          <p className="mt-4 text-xs text-gz-ink/70">Amounts count every paid donation in the period from each group.</p>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Campaign comparison" subtitle="Raised in this period, with donors per campaign" />
          <BarList
            format={randWhole}
            items={[...a.byCampaign.entries()]
              .map(([k, v]) => ({ key: k, label: k === "general" ? "General fund" : campaignName(k, lookups.campaign), value: v.cents, note: `${count(v.donors.size)} donors` }))
              .sort((x, y) => y.value - x.value)}
          />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Donation amounts"
            subtitle="How big donations are, in this period"
            action={<Segmented label="Measure" size="sm" value={dist} onChange={setDist} options={[{ value: "count", label: "Number" }, { value: "value", label: "Value" }]} />}
          />
          <BarChart
            labels={["<R100", "R100+", "R250+", "R500+", "R1k+", "R2.5k+", "R5k+"]}
            tipLabels={a.dist.map((b) => b.label)}
            series={[{ name: dist === "count" ? "Donations" : "Value", colour: "blue", values: a.dist.map((b) => (dist === "count" ? b.count : b.cents)) }]}
            format={dist === "count" ? count : rand}
            axisFormat={dist === "count" ? count : randShort}
            height={240}
          />
        </Card>
        <Card>
          <CardHeader title="Monthly giving trend" subtitle="Once-off and monthly donations each month" />
          <LineChart
            area={false}
            labels={labels}
            tipLabels={tips}
            series={[
              { name: "Once-off", colour: "blue", values: a.series.map((p) => p.onceCents) },
              { name: "Monthly", colour: "sage", values: a.series.map((p) => p.monthlyCents) },
            ]}
            format={rand}
            axisFormat={randShort}
            height={240}
          />
          <p className="mt-3 text-sm text-gz-muted">
            Monthly donations were {permille(a.now.raisedCents ? Math.round((a.now.monthlyCents * 1000) / a.now.raisedCents) : 0)} of everything raised. {count(a.rec.at(-1)?.activeAtEnd ?? 0)} were active at the end of the period.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Where donors give" subtitle="Share of the amount raised in this period" />
        <BarList
          format={rand}
          colour="lilac"
          items={[
            { key: "app", label: "Givezy app", value: a.app, note: permille(a.now.raisedCents ? Math.round((a.app * 1000) / a.now.raisedCents) : 0) },
            { key: "web", label: "Website", value: a.now.raisedCents - a.app, note: permille(a.now.raisedCents ? Math.round(((a.now.raisedCents - a.app) * 1000) / a.now.raisedCents) : 0) },
          ]}
        />
      </Card>
    </div>
  );
}

function Split({ label, donors, total, cents, raised }: { label: string; donors: number; total: number; cents: number; raised: number }) {
  return (
    <div>
      <dt className="text-sm font-semibold">{label}</dt>
      <dd className="mt-1">
        <span className="block text-2xl font-semibold text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>
          {count(donors)}
        </span>
        <span className="block text-sm text-gz-ink/80">
          {permille(total ? Math.round((donors * 1000) / total) : 0)} of donors · {randWhole(cents)} ({permille(raised ? Math.round((cents * 1000) / raised) : 0)})
        </span>
      </dd>
    </div>
  );
}
