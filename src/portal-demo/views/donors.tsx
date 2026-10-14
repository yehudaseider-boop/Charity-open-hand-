"use client";

import { useMemo, useState } from "react";
import { centsToPlain } from "@/lib/csv";
import { DEMO_TODAY } from "../data/demo-config";
import { addMonths, monthKey, showMonth } from "../data/day";
import { dayOf, donorStats, firstGiftDays, presetRange, previousRange, SEGMENT_LABELS, summarise, type DonorSegment, type DonorStats } from "../data/selectors";
import type { DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { BarChart } from "../ui/charts";
import { count, date, permille, rand, randShort } from "../ui/format";
import { FilterSelect, SearchInput } from "../ui/form";
import { Icon } from "../ui/icons";
import { Drawer } from "../ui/overlay";
import { Avatar, Badge, Button, Callout, Card, CardHeader, cx, DetailList, EmptyState, PageHeader, type Tone } from "../ui/primitives";
import { DataTable, type Column } from "../ui/table";
import { campaignName, DonationStatusBadge, Loaded, RecurringStatusBadge, Stat, useExport, useLookups, useQueryParam } from "./common";

export function DonorsView() {
  return <Loaded>{(data) => <Donors data={data} />}</Loaded>;
}

const SEGMENT_TONE: Record<DonorSegment, Tone> = { new: "info", active: "success", lapsing: "warning", lapsed: "neutral" };

export function SegmentBadge({ segment }: { segment: DonorSegment }) {
  return (
    <Badge tone={SEGMENT_TONE[segment]} icon={segment === "new" ? "spark" : segment === "lapsed" ? "clock" : undefined}>
      {SEGMENT_LABELS[segment]}
    </Badge>
  );
}

type Filter = "all" | DonorSegment | "monthly" | "repeat" | "anonymous" | "s18a";

function Donors({ data }: { data: DemoDataset }) {
  const exportCsv = useExport();
  const lookups = useLookups(data);
  const everyone = useMemo(() => donorStats(data), [data]);
  // The directory lists people who have given; a profile opened from a donation can be anyone.
  const all = useMemo(() => everyone.filter((d) => d.giftCount > 0 || d.hasMonthly), [everyone]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [type, setType] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const fromAddress = useQueryParam("donor");
  const [applied, setApplied] = useState<string | null>(null);
  if (fromAddress && applied !== fromAddress) {
    setApplied(fromAddress);
    setOpenId(fromAddress);
  }

  const stats = useMemo(() => {
    const firsts = firstGiftDays(data);
    const r90 = presetRange("90d");
    const now = summarise(data, r90, firsts);
    const before = summarise(data, previousRange(r90), firsts);
    const repeat = all.filter((d) => d.giftCount >= 2).length;
    // Retention: of donors who gave in the 90 days before, how many gave again in the last 90 days.
    const beforeIds = new Set(data.donations.filter((d) => d.status === "paid" && dayOf(d) >= previousRange(r90).from && dayOf(d) <= previousRange(r90).to).map((d) => d.donorId));
    const nowIds = new Set(data.donations.filter((d) => d.status === "paid" && dayOf(d) >= r90.from).map((d) => d.donorId));
    let kept = 0;
    for (const id of beforeIds) if (nowIds.has(id)) kept++;
    return {
      now,
      before,
      repeatPermille: all.length ? Math.round((repeat * 1000) / all.length) : 0,
      retentionPermille: beforeIds.size ? Math.round((kept * 1000) / beforeIds.size) : 0,
      bySegment: (["new", "active", "lapsing", "lapsed"] as DonorSegment[]).map((s) => [s, all.filter((d) => d.segment === s).length] as const),
    };
  }, [data, all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((d) => {
      if (type !== "all" && d.type !== type) return false;
      if (filter === "monthly" && !d.hasMonthly) return false;
      if (filter === "repeat" && d.giftCount < 2) return false;
      if (filter === "anonymous" && !d.anyAnonymous) return false;
      if (filter === "s18a" && !d.wants18a) return false;
      if (["new", "active", "lapsing", "lapsed"].includes(filter) && d.segment !== filter) return false;
      return !needle || `${d.name} ${d.email} ${d.city}`.toLowerCase().includes(needle);
    });
  }, [all, q, filter, type]);

  const columns: Column<DonorStats>[] = [
    {
      key: "name",
      header: "Donor",
      sort: (d) => d.name,
      cell: (d) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={d.name} size={32} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold text-gz-ink">
              {d.name}
              {d.anyAnonymous && <Icon name="eyeOff" size={14} className="text-gz-muted" label="Asked to be anonymous in public" />}
            </span>
            <span className="block text-xs text-gz-muted">{d.email}</span>
          </span>
        </span>
      ),
    },
    { key: "segment", header: "Status", sort: (d) => d.segment, cell: (d) => <SegmentBadge segment={d.segment} /> },
    { key: "gifts", header: "Donations", align: "right", sort: (d) => d.giftCount, cell: (d) => count(d.giftCount) },
    { key: "total", header: "Total given", align: "right", sort: (d) => d.totalCents, cell: (d) => <span className="font-semibold">{rand(d.totalCents)}</span> },
    { key: "monthly", header: "Monthly", align: "right", sort: (d) => d.monthlyCents, cell: (d) => (d.hasMonthly ? <Badge tone="lilac" icon="repeat">{rand(d.monthlyCents)}</Badge> : <span className="text-gz-muted">None</span>), wide: true },
    { key: "first", header: "First gift", sort: (d) => d.firstDay ?? "", cell: (d) => (d.firstDay ? date(`${d.firstDay}T12:00:00Z`) : "None"), wide: true },
    { key: "last", header: "Last gift", sort: (d) => d.lastDay ?? "", cell: (d) => (d.lastDay ? date(`${d.lastDay}T12:00:00Z`) : "None") },
    { key: "city", header: "City", sort: (d) => d.city, cell: (d) => d.city, wide: true },
  ];

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: "All donors" },
    { value: "new", label: "New" },
    { value: "active", label: "Active" },
    { value: "lapsing", label: "Lapsing" },
    { value: "lapsed", label: "Lapsed" },
    { value: "repeat", label: "Gave more than once" },
    { value: "monthly", label: "Monthly donors" },
    { value: "s18a", label: "Asked for s18A" },
    { value: "anonymous", label: "Anonymous in public" },
  ];

  const open = openId ? everyone.find((d) => d.id === openId) ?? null : null;

  return (
    <div className="gz-fade-in">
      <PageHeader
        title="Donors"
        subtitle="Everyone who has given to your charity, how often, and whether they are still giving."
        actions={
          <Button
            variant="secondary"
            icon="download"
            onClick={() =>
              exportCsv(
                "donors",
                ["Donor", "Email", "City", "Type", "Status", "Donations", "Total given (R)", "First gift", "Last gift", "Monthly (R)", "s18A requested", "Anonymous on public pages"],
                rows.map((d) => [d.name, d.email, d.city, d.type === "company" ? "Company" : "Individual", SEGMENT_LABELS[d.segment], d.giftCount, centsToPlain(d.totalCents), d.firstDay ? date(`${d.firstDay}T12:00:00Z`) : "", d.lastDay ? date(`${d.lastDay}T12:00:00Z`) : "", centsToPlain(d.monthlyCents), d.wants18a ? "Yes" : "No", d.anyAnonymous ? "Yes" : "No"]),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Donors who have given" value={count(all.length)} />
        <Stat label="First-time donors, last 90 days" value={count(stats.now.newDonors)} />
        <Stat label="Returning donors, last 90 days" value={count(stats.now.returningDonors)} />
        <Stat label="Kept from the 90 days before" value={permille(stats.retentionPermille)} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Where your donors are" subtitle="By their last donation. New: first gift in the last 60 days. Active: gave in the last 120 days. Lapsing: 120 to 240 days. Lapsed: longer." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.bySegment.map(([s, n]) => (
              <button key={s} type="button" onClick={() => setFilter(s)} className={cx("rounded-2xl border p-4 text-left transition-colors", filter === s ? "border-gz-blue bg-gz-blue-soft/50" : "border-gz-hairline hover:border-gz-blue/40")}>
                <SegmentBadge segment={s} />
                <p className="mt-2 text-2xl font-semibold" style={{ fontFamily: "var(--font-fredoka)" }}>
                  {count(n)}
                </p>
                <p className="text-xs text-gz-muted">{permille(all.length ? Math.round((n * 1000) / all.length) : 0)} of donors</p>
              </button>
            ))}
          </div>
        </Card>
        <Card className="bg-gz-lilac-soft">
          <CardHeader title="Gave more than once" />
          <p className="text-4xl font-semibold text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>
            {permille(stats.repeatPermille)}
          </p>
          <p className="mt-2 text-sm text-gz-ink/80">of your donors have given at least twice. A thank-you within a week of a first gift is the best-known way to raise this.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setFilter("new")}>
            See new donors
          </Button>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, email or city" label="Search donors" />
          <FilterSelect label="Donor type" value={type} onChange={setType} options={[{ value: "all", label: "People and companies" }, { value: "individual", label: "People" }, { value: "company", label: "Companies" }]} />
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Donor group">
          {chips.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={filter === c.value} onClick={() => setFilter(c.value)} className={cx("min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold", filter === c.value ? "border-gz-blue bg-gz-blue text-white" : "border-gz-hairline bg-gz-surface text-gz-ink hover:border-gz-blue/40")}>
              {c.label}
            </button>
          ))}
        </div>
        <DataTable
          caption="Donors"
          rows={rows}
          columns={columns}
          rowKey={(d) => d.id}
          onRowClick={(d) => setOpenId(d.id)}
          rowLabel={(d) => `Open ${d.name}`}
          initialSort={{ key: "total", dir: "desc" }}
          pageSize={15}
          mobile={(d) => (
            <span className="flex items-center gap-3">
              <Avatar name={d.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{d.name}</span>
                <span className="block text-xs text-gz-muted">
                  {count(d.giftCount)} donations · last {d.lastDay ? date(`${d.lastDay}T12:00:00Z`) : "none"}
                </span>
                <span className="mt-1 block">
                  <SegmentBadge segment={d.segment} />
                </span>
              </span>
              <span className="font-semibold">{rand(d.totalCents)}</span>
            </span>
          )}
          empty={<EmptyState icon="users" title="No donors match" body="Try another search or group." />}
        />
      </Card>

      {open && <DonorDrawer donor={open} data={data} lookups={lookups} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function DonorDrawer({ donor, data, lookups, onClose }: { donor: DonorStats; data: DemoDataset; lookups: ReturnType<typeof useLookups>; onClose: () => void }) {
  const { toast } = usePortal();
  const gifts = data.donations.filter((d) => d.donorId === donor.id);
  const plans = data.recurring.filter((p) => p.donorId === donor.id);
  const months = Array.from({ length: 12 }, (_, i) => monthKey(addMonths(DEMO_TODAY, i - 11)));
  const byMonth = months.map((k) => gifts.filter((g) => g.status === "paid" && monthKey(dayOf(g)) === k).reduce((s, g) => s + g.amountCents, 0));
  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <Avatar name={donor.name} size={44} />
          <span>{donor.name}</span>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <SegmentBadge segment={donor.segment} />
          {donor.hasMonthly && <Badge tone="lilac" icon="repeat">Monthly donor</Badge>}
          {donor.wants18a && <Badge tone="success" icon="receipt">s18A requested</Badge>}
          {donor.type === "company" && <Badge tone="info" icon="building">Company</Badge>}
        </span>
      }
      footer={
        <Button variant="secondary" size="sm" icon="mail" onClick={() => toast({ tone: "info", title: "Not sent: demo only", body: `The live portal would open a thank-you email to ${donor.email}. Nothing was sent.` })}>
          Say thank you
        </Button>
      }
    >
      <div className="space-y-5">
        {donor.anyAnonymous && (
          <Callout tone="lilac" title="Anonymous in public" icon="eyeOff">
            This donor asked for at least one donation to be anonymous. Their name is hidden on public pages and campaign lists. Your charity still sees their details, as the checkout told them.
          </Callout>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Total given" value={rand(donor.totalCents)} />
          <Mini label="Donations" value={count(donor.giftCount)} />
          <Mini label="Average" value={rand(donor.giftCount ? Math.round(donor.totalCents / donor.giftCount) : 0)} />
        </div>
        <Card padded={false} className="p-4">
          <p className="mb-2 text-sm font-semibold">Last 12 months</p>
          <BarChart labels={months.map((k) => showMonth(k, true))} tipLabels={months.map((k) => showMonth(k))} series={[{ name: "Given", colour: "blue", values: byMonth }]} format={rand} axisFormat={randShort} height={150} />
        </Card>
        <DetailList
          items={[
            ["Email", donor.email],
            ["City", donor.city],
            ["First gift", donor.firstDay ? date(`${donor.firstDay}T12:00:00Z`) : "None"],
            ["Last gift", donor.lastDay ? date(`${donor.lastDay}T12:00:00Z`) : "None"],
            ["Campaigns supported", donor.campaignIds.length ? donor.campaignIds.map((id) => campaignName(id, lookups.campaign)).join(", ") : "General fund only"],
          ]}
        />
        {plans.length > 0 && (
          <div>
            <h3 className="mb-2 text-base">Monthly donations</h3>
            <ul className="space-y-2">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-2xl border border-gz-hairline bg-gz-surface p-3 text-sm">
                  <span>
                    <span className="font-semibold">{rand(p.amountCents)} a month</span>
                    <span className="block text-xs text-gz-muted">Since {date(p.startedAt)} · on day {p.dayOfMonth}</span>
                  </span>
                  <RecurringStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-base">Giving history</h3>
          <ul className="divide-y divide-gz-hairline rounded-2xl border border-gz-hairline bg-gz-surface px-3">
            {gifts.slice(0, 25).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{date(g.donatedAt)}</span>
                  <span className="block truncate text-xs text-gz-muted">
                    {campaignName(g.campaignId, lookups.campaign)} · {g.kind === "monthly" ? "Monthly" : "Once-off"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <DonationStatusBadge status={g.status} />
                  <span className="w-20 text-right font-semibold">{rand(g.amountCents)}</span>
                </span>
              </li>
            ))}
          </ul>
          {gifts.length > 25 && <p className="mt-2 text-xs text-gz-muted">Showing the latest 25 of {gifts.length}.</p>}
        </div>
      </div>
    </Drawer>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gz-hairline bg-gz-surface p-3">
      <p className="text-[11px] font-semibold text-gz-muted">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
