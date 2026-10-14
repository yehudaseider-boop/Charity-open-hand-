"use client";

import { useMemo, useState } from "react";
import { dayOf, donorName, inRange, RANGE_LABELS } from "../data/selectors";
import type { DemoDataset, Donation, DonationStatus } from "../data/types";
import { usePortal } from "../store";
import { DateRangePicker } from "../ui/date-range";
import { count, date, rand } from "../ui/format";
import { FilterSelect, SearchInput } from "../ui/form";
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from "../ui/primitives";
import { DataTable, type Column } from "../ui/table";
import { campaignName, DonationDrawer, DonationStatusBadge, donationCsvRows, Loaded, netOf, Stat, useExport, useLookups, useQueryParam } from "./common";

export function DonationsView() {
  return <Loaded>{(data) => <Donations data={data} />}</Loaded>;
}

function Donations({ data }: { data: DemoDataset }) {
  const { range, rangePreset } = usePortal();
  const lookups = useLookups(data);
  const exportCsv = useExport();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | DonationStatus>("all");
  const [campaign, setCampaign] = useState("all");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState<Donation | null>(null);
  const fromAddress = useQueryParam("status");
  const [applied, setApplied] = useState(false);
  if (!applied && fromAddress && ["paid", "pending", "failed", "refunded"].includes(fromAddress)) {
    setApplied(true);
    setStatus(fromAddress as DonationStatus);
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.donations.filter((d) => {
      if (!inRange(dayOf(d), range)) return false;
      if (status !== "all" && d.status !== status) return false;
      if (campaign !== "all" && (d.campaignId ?? "general") !== campaign) return false;
      if (kind !== "all" && d.kind !== kind) return false;
      if (!needle) return true;
      const donor = lookups.donor.get(d.donorId);
      const hay = `${donorName(donor)} ${donor?.email ?? ""} ${d.ref} ${(d.amountCents / 100).toString()}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data, range, status, campaign, kind, q, lookups]);

  const totals = useMemo(() => {
    const paid = rows.filter((d) => d.status === "paid");
    return {
      paidCount: paid.length,
      gross: paid.reduce((s, d) => s + d.amountCents, 0),
      net: rows.reduce((s, d) => s + netOf(d), 0),
    };
  }, [rows]);

  const filtersOn = q || status !== "all" || campaign !== "all" || kind !== "all";
  const clear = () => {
    setQ("");
    setStatus("all");
    setCampaign("all");
    setKind("all");
  };

  const columns: Column<Donation>[] = [
    {
      key: "donor",
      header: "Donor",
      sort: (d) => donorName(lookups.donor.get(d.donorId)),
      cell: (d) => {
        const donor = lookups.donor.get(d.donorId);
        return (
          <span className="flex items-center gap-2.5">
            <Avatar name={donorName(donor)} size={32} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold text-gz-ink">
                {donorName(donor)}
                {d.anonymous && <Badge tone="lilac" icon="eyeOff" className="!px-1.5">Anon</Badge>}
              </span>
              <span className="block text-xs text-gz-muted">{d.ref}</span>
            </span>
          </span>
        );
      },
    },
    { key: "date", header: "Donated", sort: (d) => d.donatedAt, cell: (d) => date(d.donatedAt) },
    { key: "campaign", header: "Campaign", wrap: true, sort: (d) => campaignName(d.campaignId, lookups.campaign), cell: (d) => <span className="line-clamp-1 max-w-48">{campaignName(d.campaignId, lookups.campaign)}</span> },
    
    { key: "status", header: "Status", sort: (d) => d.status, cell: (d) => <DonationStatusBadge status={d.status} /> },
    { key: "settled", header: "Settled", sort: (d) => d.settledAt ?? "", cell: (d) => (d.settledAt ? date(d.settledAt) : <span className="text-gz-muted">Not yet</span>), wide: true },
    { key: "gross", header: "Gross", align: "right", sort: (d) => d.amountCents, cell: (d) => <span className={d.status === "paid" ? "font-semibold" : "text-gz-muted line-through decoration-gz-muted/50"}>{rand(d.amountCents)}</span> },
    { key: "fee", header: "Fee", align: "right", sort: (d) => d.processingFeeCents, cell: (d) => <span className="text-gz-muted">{d.processingFeeCents ? rand(d.processingFeeCents) : "R0"}</span>, wide: true },
    { key: "net", header: "Net", align: "right", sort: (d) => netOf(d), cell: (d) => <span className="font-semibold text-gz-blue">{rand(netOf(d))}</span> },
  ];

  const campaignOptions = [{ value: "all", label: "All campaigns" }, { value: "general", label: "General fund" }, ...data.campaigns.filter((c) => c.status !== "draft").map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className="gz-fade-in">
      <PageHeader
        title="Donations"
        subtitle="Every donation to your charity, with what you receive after fees. Open one to see when it settled and was paid out."
        actions={
          <>
            <DateRangePicker />
            <Button
              variant="secondary"
              icon="download"
              onClick={() => {
                const { header, body } = donationCsvRows(rows, lookups);
                exportCsv("donations", header, body);
              }}
            >
              Export CSV
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Paid donations" value={count(totals.paidCount)} />
        <Stat label="Gross (paid)" value={rand(totals.gross)} />
        <Stat label="Net to your charity" value={rand(totals.net)} />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search donor, email, reference or amount" label="Search donations" />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "paid", label: "Paid" },
              { value: "pending", label: "Pending" },
              { value: "failed", label: "Failed" },
              { value: "refunded", label: "Refunded" },
            ]}
          />
          <FilterSelect label="Campaign" value={campaign} onChange={setCampaign} options={campaignOptions} />
          <FilterSelect label="Type" value={kind} onChange={setKind} options={[{ value: "all", label: "Once-off and monthly" }, { value: "once", label: "Once-off" }, { value: "monthly", label: "Monthly" }]} />
          {filtersOn && (
            <Button variant="ghost" size="sm" icon="x" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
        <p className="mb-3 text-xs text-gz-muted">
          {RANGE_LABELS[rangePreset]} · by donation date · {count(rows.length)} donations. Net counts paid donations after fees; a refunded donation shows the fee that was not returned.
        </p>
        <DataTable
          caption="Donations"
          rows={rows}
          columns={columns}
          rowKey={(d) => d.id}
          onRowClick={setOpen}
          rowLabel={(d) => `Open donation ${d.ref}`}
          initialSort={{ key: "date", dir: "desc" }}
          pageSize={15}
          mobile={(d) => {
            const donor = lookups.donor.get(d.donorId);
            return (
              <span className="flex items-center gap-3">
                <Avatar name={donorName(donor)} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{donorName(donor)}</span>
                  <span className="block truncate text-xs text-gz-muted">
                    {date(d.donatedAt)} · {campaignName(d.campaignId, lookups.campaign)}
                  </span>
                  <span className="mt-1 block">
                    <DonationStatusBadge status={d.status} />
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{rand(d.amountCents)}</span>
                  <span className="block text-xs text-gz-muted">net {rand(netOf(d))}</span>
                </span>
              </span>
            );
          }}
          empty={<EmptyState title="No donations match" body="Try a wider date range or clear the filters." action={filtersOn ? <Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button> : undefined} />}
        />
      </Card>
      <DonationDrawer donation={open} onClose={() => setOpen(null)} data={data} />
    </div>
  );
}
