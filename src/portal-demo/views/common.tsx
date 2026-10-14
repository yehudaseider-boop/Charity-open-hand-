"use client";

/** Helpers shared by the portal screens: loading guard, lookups, status badges, CSV export, donation drawer. */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { centsToPlain, toCsv } from "@/lib/csv";
import { DEMO_PAYOUT_SCHEDULE } from "../data/demo-config";
import { donorName } from "../data/selectors";
import type { Campaign, CampaignStatus, DemoDataset, Donation, DonationStatus, Donor, Payout, RecurringStatus } from "../data/types";
import { usePortal } from "../store";
import { date, dateTime, rand } from "../ui/format";
import { MetricSkeleton } from "../ui/metric";
import { Drawer } from "../ui/overlay";
import { Badge, Button, Callout, Card, DetailList, Skeleton, type Tone } from "../ui/primitives";
import { BASE } from "../ui/shell";

/** Shows skeletons while the demo data loads (the mock API waits a moment on purpose). */
export function Loaded({ children }: { children: (data: DemoDataset) => ReactNode }) {
  const { data, loading } = usePortal();
  if (loading || !data) {
    return (
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="mb-2 h-9 w-56" />
        <Skeleton className="mb-8 h-4 w-80 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
        </div>
        <Card className="mt-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-6 h-56 w-full" />
        </Card>
      </div>
    );
  }
  return <>{children(data)}</>;
}

export function useLookups(data: DemoDataset) {
  return useMemo(
    () => ({
      donor: new Map<string, Donor>(data.donors.map((d) => [d.id, d])),
      campaign: new Map<string, Campaign>(data.campaigns.map((c) => [c.id, c])),
      payout: new Map<string, Payout>(data.payouts.map((p) => [p.id, p])),
    }),
    [data],
  );
}

const DONATION_STATUS: Record<DonationStatus, [string, Tone]> = {
  paid: ["Paid", "success"],
  pending: ["Pending", "warning"],
  failed: ["Failed", "danger"],
  refunded: ["Refunded", "neutral"],
};

export function DonationStatusBadge({ status }: { status: DonationStatus }) {
  const [label, tone] = DONATION_STATUS[status];
  return (
    <Badge tone={tone} icon={status === "refunded" ? "refresh" : undefined}>
      {label}
    </Badge>
  );
}

const CAMPAIGN_STATUS: Record<CampaignStatus, [string, Tone]> = {
  active: ["Active", "success"],
  draft: ["Draft", "neutral"],
  paused: ["Paused", "warning"],
  ended: ["Ended", "info"],
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const [label, tone] = CAMPAIGN_STATUS[status];
  return (
    <Badge tone={tone} icon={status === "paused" ? "pause" : status === "draft" ? "edit" : status === "ended" ? "flag" : undefined}>
      {label}
    </Badge>
  );
}

const RECURRING_STATUS: Record<RecurringStatus, [string, Tone]> = {
  active: ["Active", "success"],
  paused: ["Paused", "warning"],
  cancelled: ["Cancelled", "neutral"],
};

export function RecurringStatusBadge({ status }: { status: RecurringStatus }) {
  const [label, tone] = RECURRING_STATUS[status];
  return (
    <Badge tone={tone} icon={status === "paused" ? "pause" : status === "cancelled" ? "x" : undefined}>
      {label}
    </Badge>
  );
}

export function campaignName(id: string | null, campaigns: Map<string, Campaign>): string {
  return id ? (campaigns.get(id)?.name ?? "Removed campaign") : "General fund";
}

/** Builds a CSV in the browser and downloads it. Demo data only: nothing is sent anywhere. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useExport() {
  const { toast, data } = usePortal();
  return (name: string, header: string[], rows: (string | number | null)[][]) => {
    if (!rows.length) {
      toast({ tone: "error", title: "Nothing to export", body: "No rows match the filters. Change them and try again." });
      return;
    }
    const slug = data?.charity.publicSlug ?? "charity";
    downloadCsv(`givezy-demo-${slug}-${name}.csv`, header, rows);
    toast({ tone: "success", title: `Exported ${rows.length} rows`, body: "Demo CSV with fictional data, made in your browser. The live portal logs every export." });
  };
}

export function donationCsvRows(rows: Donation[], lookups: ReturnType<typeof useLookups>) {
  const header = ["Reference", "Donation date", "Donor", "Donor email", "Campaign", "Type", "Status", "Amount (R)", "Processing fee (R)", "Platform fee (R)", "Net (R)", "Settled", "Payout", "s18A requested", "Anonymous on public pages"];
  const body = rows.map((d) => {
    const donor = lookups.donor.get(d.donorId);
    const net = d.status === "paid" ? d.amountCents - d.processingFeeCents - d.platformFeeCents : d.status === "refunded" ? -d.processingFeeCents : 0;
    return [
      d.ref,
      dateTime(d.donatedAt),
      donorName(donor),
      donor?.email ?? "",
      campaignName(d.campaignId, lookups.campaign),
      d.kind === "monthly" ? "Monthly" : "Once-off",
      DONATION_STATUS[d.status][0],
      centsToPlain(d.amountCents),
      centsToPlain(d.processingFeeCents),
      centsToPlain(d.platformFeeCents),
      centsToPlain(net),
      d.settledAt ? date(d.settledAt) : "",
      d.payoutId ? (lookups.payout.get(d.payoutId)?.ref ?? "") : "",
      d.wants18a ? "Yes" : "No",
      d.anonymous ? "Yes" : "No",
    ];
  });
  return { header, body };
}

/** What the charity receives from one donation, by status. */
export function netOf(d: Donation): number {
  if (d.status === "paid") return d.amountCents - d.processingFeeCents - d.platformFeeCents;
  if (d.status === "refunded") return -d.processingFeeCents - d.platformFeeCents;
  return 0;
}

/** Full details of one donation, with the donation, settlement and payout dates kept apart. */
export function DonationDrawer({ donation, onClose, data }: { donation: Donation | null; onClose: () => void; data: DemoDataset }) {
  const lookups = useLookups(data);
  const { toast } = usePortal();
  if (!donation) return null;
  const donor = lookups.donor.get(donation.donorId);
  const payout = donation.payoutId ? lookups.payout.get(donation.payoutId) : undefined;
  const name = donorName(donor);
  return (
    <Drawer
      open
      onClose={onClose}
      title={rand(donation.amountCents)}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <DonationStatusBadge status={donation.status} />
          <span>{donation.ref}</span>
        </span>
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon="copy"
            onClick={() => {
              navigator.clipboard?.writeText(donation.ref).catch(() => undefined);
              toast({ tone: "success", title: "Reference copied", body: donation.ref });
            }}
          >
            Copy reference
          </Button>
          <Link href={`${BASE}/donors?donor=${encodeURIComponent(donation.donorId)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-gz-blue hover:bg-gz-blue-soft/60">
            View donor
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <Card padded={false} className="p-4">
          <p className="text-xs font-semibold text-gz-muted">Donor</p>
          <p className="mt-1 font-semibold">{name}</p>
          <p className="text-sm text-gz-muted">{donor?.email}</p>
          {donation.anonymous && (
            <p className="mt-2 text-xs text-gz-muted">
              <Badge tone="lilac" icon="eyeOff">Anonymous on public pages</Badge>
              <span className="mt-1 block">The donor asked to stay anonymous in public. As the checkout tells them, your charity still sees their details.</span>
            </p>
          )}
        </Card>

        {donation.status === "failed" && <Callout tone="danger" title="Payment failed">{donation.failureReason}. No money was taken.</Callout>}
        {donation.status === "pending" && <Callout tone="warning" title="Waiting for the payment">The payment provider has not confirmed this payment yet. It is not counted in your totals until it is paid.</Callout>}
        {donation.status === "refunded" && donation.refundedAt && (
          <Callout tone="neutral" title="Refunded">Refunded on {date(donation.refundedAt)}. Taken off the payout for that week. The processing fee is not returned (demo assumption, see open decisions).</Callout>
        )}

        <div>
          <h3 className="mb-1 text-base">Money</h3>
          <DetailList
            items={[
              ["Donation (gross)", rand(donation.amountCents)],
              ["Processing fee", donation.processingFeeCents ? `− ${rand(donation.processingFeeCents)}` : "R0"],
              ["Givezy platform fee", "R0"],
              ["Net to your charity", <span key="n" className="text-gz-blue">{rand(netOf(donation))}</span>],
            ]}
          />
          <p className="mt-2 text-xs text-gz-muted">Processing fee uses a placeholder demo rate. The real rate and who pays it are not decided yet.</p>
        </div>

        <div>
            <h3 className="mb-2 text-base">Dates</h3>
            <ol className="space-y-3 border-l-2 border-gz-hairline pl-4">
              <TimelineItem done label="Donated" value={dateTime(donation.donatedAt)} />
              <TimelineItem done={!!donation.settledAt} label="Settled to your account" value={donation.settledAt ? date(donation.settledAt) : donation.status === "paid" ? "Expected the next business day" : "Not applicable"} />
              <TimelineItem
                done={payout?.status === "paid"}
                label="Paid out to your bank"
                value={payout ? `${date(payout.payoutDate)} · ${payout.ref}${payout.status === "in_transit" ? " (on its way)" : ""}` : donation.settledAt ? "In the next weekly payout" : "Not yet"}
              />
            </ol>
            <p className="mt-2 text-xs text-gz-muted">{DEMO_PAYOUT_SCHEDULE}.</p>
          </div>

        <div>
          <h3 className="mb-1 text-base">Details</h3>
          <DetailList
            items={[
              ["Campaign", campaignName(donation.campaignId, lookups.campaign)],
              ["Type", donation.kind === "monthly" ? "Monthly donation" : "Once-off"],
              ["Given through", donation.channel === "app" ? "Givezy app" : "Website"],
              ["Card", `Ending ${donation.cardLast4}`],
              ["s18A receipt requested", donation.wants18a ? "Yes" : "No"],
            ]}
          />
        </div>
      </div>
    </Drawer>
  );
}

function TimelineItem({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[23px] top-1 size-3 rounded-full border-2 border-gz-surface ${done ? "bg-gz-sage" : "bg-gz-hairline"}`} aria-hidden />
      <p className="text-xs font-semibold text-gz-muted">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </li>
  );
}

/** Reads a filter passed in the address (for example ?status=failed from the overview), once. */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once, after hydration
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return value;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gz-hairline bg-gz-surface px-4 py-3">
      <p className="text-xs font-semibold text-gz-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-gz-ink" style={{ fontFamily: "var(--font-fredoka)" }}>
        {value}
      </p>
    </div>
  );
}
