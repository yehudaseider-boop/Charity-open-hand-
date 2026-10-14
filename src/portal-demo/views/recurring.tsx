"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { centsToPlain } from "@/lib/csv";
import { showMonth } from "../data/day";
import { localDay } from "../data/generate";
import { canCompare, donorName, nextChargeDay, previousRange, RANGE_LABELS, recurringSeries, recurringSummary } from "../data/selectors";
import type { DemoDataset, RecurringPlan, RecurringStatus } from "../data/types";
import { usePortal } from "../store";
import { BarChart, LineChart } from "../ui/charts";
import { DateRangePicker } from "../ui/date-range";
import { count, date, permille, rand } from "../ui/format";
import { FilterSelect, SearchInput } from "../ui/form";
import { MetricCard } from "../ui/metric";
import { Drawer } from "../ui/overlay";
import { Avatar, Button, Callout, Card, CardHeader, DetailList, EmptyState, PageHeader } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { DataTable } from "../ui/table";
import { campaignName, DonationStatusBadge, Loaded, RecurringStatusBadge, useExport, useLookups } from "./common";

export function RecurringView() {
  return <Loaded>{(data) => <Recurring data={data} />}</Loaded>;
}

type Row = RecurringPlan & { donor: string; email: string; collectedCents: number; collectedCount: number; failedCount: number; lastFailed: boolean; next: string | null };

function Recurring({ data }: { data: DemoDataset }) {
  const { range, rangePreset } = usePortal();
  const lookups = useLookups(data);
  const exportCsv = useExport();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | RecurringStatus | "failing">("all");
  const [open, setOpen] = useState<Row | null>(null);

  const s = useMemo(() => recurringSummary(data, range), [data, range]);
  const before = useMemo(() => (canCompare(range) ? recurringSummary(data, previousRange(range)) : null), [data, range]);
  const series = useMemo(() => recurringSeries(data, range), [data, range]);

  const rows = useMemo<Row[]>(() => {
    const charges = new Map<string, typeof data.donations>();
    for (const d of data.donations) if (d.recurringId) charges.set(d.recurringId, [...(charges.get(d.recurringId) ?? []), d]);
    return data.recurring.map((p) => {
      const list = charges.get(p.id) ?? [];
      const donor = lookups.donor.get(p.donorId);
      return {
        ...p,
        donor: donorName(donor),
        email: donor?.email ?? "",
        collectedCents: list.filter((d) => d.status === "paid").reduce((a, d) => a + d.amountCents, 0),
        collectedCount: list.filter((d) => d.status === "paid").length,
        failedCount: list.filter((d) => d.status === "failed").length,
        lastFailed: list[0]?.status === "failed",
        next: nextChargeDay(p),
      };
    });
  }, [data, lookups]);

  const shown = useMemo(
    () =>
      rows.filter((r) => {
    if (status === "failing" ? !(r.lastFailed && r.status === "active") : status !== "all" && r.status !== status) return false;
    const n = q.trim().toLowerCase();
    return !n || `${r.donor} ${r.email}`.toLowerCase().includes(n);
      }),
    [rows, status, q],
  );
  const failing = rows.filter((r) => r.lastFailed && r.status === "active").length;
  const labels = series.map((p) => showMonth(p.key, series.length > 6));
  const tips = series.map((p) => showMonth(p.key));

  return (
    <div className="gz-fade-in space-y-6">
      <PageHeader title="Monthly giving" subtitle="Donors who give every month: what to expect, what came in, and who might need a nudge." actions={<DateRangePicker />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard highlight label="Expected each month" icon="repeat" value={rand(s.expectedMonthlyCents)} note={`From ${count(s.active)} active monthly donations`} />
        <MetricCard label="Collected" icon="check" value={rand(s.collectedCents)} delta={before?.collectedCents ? Math.round(((s.collectedCents - before.collectedCents) * 1000) / before.collectedCents) : null} note={`${count(s.collectedCount)} successful collections`} trend={series.map((p) => p.collectedCents)} />
        <MetricCard label="Failed collections" icon="alert" value={count(s.failedCount)} delta={before?.failedCount ? Math.round(((s.failedCount - before.failedCount) * 1000) / before.failedCount) : null} goodWhenDown note={`${count(failing)} donors whose last payment failed`} trend={series.map((p) => p.failedCount)} trendColour="orange" />
        <MetricCard label="Still giving" icon="users" value={s.retentionPermille === null ? "None" : permille(s.retentionPermille)} note={`Of plans active at the start · ${count(s.cancelledInRange)} cancelled in the period`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Active monthly donations" subtitle="At the end of each month" />
          <LineChart labels={labels} tipLabels={tips} series={[{ name: "Active", colour: "sage", values: series.map((p) => p.activeAtEnd) }]} format={count} axisFormat={count} height={220} />
        </Card>
        <Card>
          <CardHeader title="Collections" subtitle="Successful and failed charges each month" />
          <BarChart
            stacked
            labels={labels}
            tipLabels={tips}
            series={[
              { name: "Successful", colour: "blue", values: series.map((p) => p.collectedCount) },
              { name: "Failed", colour: "orange", values: series.map((p) => p.failedCount) },
            ]}
            format={count}
            axisFormat={count}
            height={220}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="New and cancelled" subtitle={`Sign-ups against cancellations · ${RANGE_LABELS[rangePreset].toLowerCase()}`} />
        <BarChart
          labels={labels}
          tipLabels={tips}
          series={[
            { name: "Started", colour: "blue", values: series.map((p) => p.started) },
            { name: "Cancelled", colour: "lilac", values: series.map((p) => p.cancelled) },
          ]}
          format={count}
          axisFormat={count}
          height={200}
        />
      </Card>

      <Card>
        <CardHeader
          title="Monthly donors"
          subtitle="Donors change or cancel their own monthly donation in the app or on the website. Your team can see it, not change it."
          action={
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() =>
                exportCsv(
                  "monthly-donations",
                  ["Donor", "Email", "Amount (R)", "Day of month", "Started", "Status", "Next charge", "Collected (R)", "Successful", "Failed", "Campaign"],
                  shown.map((r) => [r.donor, r.email, centsToPlain(r.amountCents), r.dayOfMonth, date(r.startedAt), r.status, r.next ? date(`${r.next}T12:00:00Z`) : "", centsToPlain(r.collectedCents), r.collectedCount, r.failedCount, campaignName(r.campaignId, lookups.campaign)]),
                )
              }
            >
              Export CSV
            </Button>
          }
        />
        <div className="mb-4 flex flex-wrap gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search donor or email" label="Search monthly donors" />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "failing", label: "Last payment failed" },
              { value: "paused", label: "Paused" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </div>
        <DataTable
          caption="Monthly donors"
          rows={shown}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          rowLabel={(r) => `Open ${r.donor}'s monthly donation`}
          initialSort={{ key: "amount", dir: "desc" }}
          columns={[
            { key: "donor", header: "Donor", sort: (r) => r.donor, cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.donor} size={32} /><span className="font-semibold">{r.donor}</span></span> },
            { key: "amount", header: "Each month", align: "right", sort: (r) => r.amountCents, cell: (r) => <span className="font-semibold">{rand(r.amountCents)}</span> },
            { key: "status", header: "Status", sort: (r) => r.status, cell: (r) => <span className="inline-flex flex-wrap gap-1"><RecurringStatusBadge status={r.status} />{r.lastFailed && r.status === "active" && <span className="text-xs font-semibold text-gz-danger">Last failed</span>}</span> },
            { key: "started", header: "Started", sort: (r) => r.startedAt, cell: (r) => date(r.startedAt), wide: true },
            { key: "next", header: "Next charge", sort: (r) => r.next ?? "", cell: (r) => (r.next ? date(`${r.next}T12:00:00Z`) : <span className="text-gz-muted">None</span>) },
            { key: "collected", header: "Collected", align: "right", sort: (r) => r.collectedCents, cell: (r) => rand(r.collectedCents) },
            { key: "failed", header: "Failed", align: "right", sort: (r) => r.failedCount, cell: (r) => (r.failedCount ? <span className="font-semibold text-gz-danger">{r.failedCount}</span> : "0"), wide: true },
          ]}
          mobile={(r) => (
            <span className="flex items-center gap-3">
              <Avatar name={r.donor} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.donor}</span>
                <span className="block text-xs text-gz-muted">{r.next ? `Next ${date(`${r.next}T12:00:00Z`)}` : `Since ${date(r.startedAt)}`}</span>
                <span className="mt-1 block"><RecurringStatusBadge status={r.status} /></span>
              </span>
              <span className="font-semibold">{rand(r.amountCents)}</span>
            </span>
          )}
          empty={<EmptyState icon="repeat" title="No monthly donors match" />}
        />
      </Card>

      {open && <PlanDrawer row={open} data={data} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PlanDrawer({ row, data, onClose }: { row: Row; data: DemoDataset; onClose: () => void }) {
  const lookups = useLookups(data);
  const charges = data.donations.filter((d) => d.recurringId === row.id);
  return (
    <Drawer open onClose={onClose} title={`${rand(row.amountCents)} a month`} subtitle={<span className="inline-flex items-center gap-2"><RecurringStatusBadge status={row.status} /> {row.donor}</span>}>
      <div className="space-y-5">
        {row.lastFailed && row.status === "active" && (
          <Callout tone="danger" title="The last payment failed">
            Givezy tries again the next day, then three days later, and emails the donor each time. After a third failure the monthly donation stops and the donor starts a new one.
          </Callout>
        )}
        <DetailList
          items={[
            ["Donor", row.donor],
            ["Email", row.email],
            ["Charge day", `Day ${row.dayOfMonth} of each month`],
            ["Started", date(row.startedAt)],
            ["Next charge", row.next ? date(`${row.next}T12:00:00Z`) : "None"],
            ...(row.cancelledAt ? ([["Cancelled", date(row.cancelledAt)]] as [string, string][]) : []),
            ...(row.pausedAt ? ([["Paused", date(row.pausedAt)]] as [string, string][]) : []),
            ["Campaign", campaignName(row.campaignId, lookups.campaign)],
            ["Collected so far", rand(row.collectedCents)],
          ]}
        />
        <div>
          <h3 className="mb-2 text-base">Charges</h3>
          <ul className="divide-y divide-gz-hairline rounded-2xl border border-gz-hairline bg-gz-surface px-3">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="block font-medium">{showMonth(localDay(c.donatedAt).slice(0, 7))}</span>
                  <span className="block text-xs text-gz-muted">{date(c.donatedAt)}{c.failureReason ? ` · ${c.failureReason}` : ""}</span>
                </span>
                <DonationStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </div>
        <Link href={`${BASE}/donors?donor=${encodeURIComponent(row.donorId)}`} className="inline-flex text-sm font-semibold text-gz-blue">
          Open donor profile
        </Link>
      </div>
    </Drawer>
  );
}
