"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DEMO_TODAY } from "../data/demo-config";
import { daysBetween, showDay } from "../data/day";
import { campaignCumulative, campaignStats, donorName } from "../data/selectors";
import type { DemoDataset, Donation } from "../data/types";
import { usePortal } from "../store";
import { LineChart } from "../ui/charts";
import { count, date, permille, rand, randShort, randWhole } from "../ui/format";
import { Icon } from "../ui/icons";
import { MetricCard } from "../ui/metric";
import { Modal } from "../ui/overlay";
import { Avatar, Button, ButtonLink, Callout, Card, CardHeader, EmptyState, Progress } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { DataTable } from "../ui/table";
import { CampaignForm, campaignLink } from "./campaign-form";
import { CampaignStatusActions } from "./campaigns";
import { CampaignStatusBadge, DonationDrawer, DonationStatusBadge, Loaded, useLookups } from "./common";

export function CampaignDetailView() {
  const { campaignId } = useParams<{ campaignId: string }>();
  return <Loaded>{(data) => <CampaignDetail data={data} id={campaignId} />}</Loaded>;
}

function CampaignDetail({ data, id }: { data: DemoDataset; id: string }) {
  const lookups = useLookups(data);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [open, setOpen] = useState<Donation | null>(null);
  const campaign = data.campaigns.find((c) => c.id === id);
  const stats = useMemo(() => (campaign ? campaignStats(data, [campaign])[0] : null), [data, campaign]);
  const cumulative = useMemo(() => (campaign ? campaignCumulative(data, campaign) : []), [data, campaign]);
  const donations = useMemo(() => data.donations.filter((d) => d.campaignId === id), [data, id]);

  if (!campaign || !stats) {
    return (
      <Card>
        <EmptyState icon="flag" title="Campaign not found" body="It may belong to another demo charity. Switch charity or go back to the list." action={<ButtonLink href={`${BASE}/campaigns`} size="sm">All campaigns</ButtonLink>} />
      </Card>
    );
  }

  const paid = donations.filter((d) => d.status === "paid");
  const topDonors = [...paid.reduce((m, d) => m.set(d.donorId, (m.get(d.donorId) ?? 0) + d.amountCents), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const appShare = paid.length ? Math.round((paid.filter((d) => d.channel === "app").length * 1000) / paid.length) : 0;
  const daysLeft = campaign.endDate && campaign.status !== "ended" ? daysBetween(DEMO_TODAY, campaign.endDate) : null;
  const link = campaignLink(data.charity.publicSlug, campaign.slug);

  return (
    <div className="gz-fade-in space-y-6">
      <div>
        <ButtonLink href={`${BASE}/campaigns`} variant="ghost" size="sm" icon="chevronLeft" className="-ml-3 mb-2">
          Campaigns
        </ButtonLink>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2">
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <h1 className="text-[28px] leading-tight sm:text-[34px]">{campaign.name}</h1>
            <p className="mt-1.5 text-[15px] text-gz-muted">{campaign.summary}</p>
            <p className="mt-2 text-sm text-gz-muted">
              {showDay(campaign.startDate)} to {campaign.endDate ? showDay(campaign.endDate) : "no end date"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="secondary" icon="link" onClick={() => setSharing(true)}>
              Share
            </Button>
            <CampaignStatusActions campaign={campaign} />
          </div>
        </div>
      </div>

      {campaign.status === "draft" && <Callout tone="neutral" title="This is a draft">Only your team can see it. Publish it when the page is ready.</Callout>}
      {campaign.status === "paused" && <Callout tone="warning" title="Paused">Donors cannot give to this campaign until you resume it.</Callout>}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gz-muted">Raised</p>
            <p className="text-4xl font-semibold text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>
              {randWhole(stats.raisedCents)}
            </p>
          </div>
          <p className="text-sm text-gz-muted">
            <strong className="text-gz-ink">{permille(stats.progressPermille)}</strong> of the {randWhole(campaign.goalCents)} goal
          </p>
        </div>
        <Progress permille={stats.progressPermille} className="mt-3 h-3.5" label="Progress to goal" />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Donors" icon="users" value={count(stats.donorCount)} />
        <MetricCard label="Donations" icon="donations" value={count(stats.donationCount)} />
        <MetricCard label="Average donation" icon="chart" value={rand(stats.averageCents)} />
        <MetricCard label={daysLeft !== null && daysLeft >= 0 ? "Days left" : "Given in the app"} icon={daysLeft !== null && daysLeft >= 0 ? "clock" : "spark"} value={daysLeft !== null && daysLeft >= 0 ? count(daysLeft) : permille(appShare)} note={daysLeft !== null && daysLeft >= 0 ? `${permille(appShare)} given in the app` : "The rest on the website"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Raised over time" subtitle="Running total of paid donations, against the goal" />
          {cumulative.length > 1 ? (
            <LineChart
              area={false}
              labels={cumulative.map((p) => showDay(p.day).slice(0, 5))}
              tipLabels={cumulative.map((p) => showDay(p.day))}
              series={[
                { name: "Raised", colour: "blue", values: cumulative.map((p) => p.cents) },
                { name: "Goal", colour: "sage", values: cumulative.map(() => campaign.goalCents) },
              ]}
              format={rand}
              axisFormat={randShort}
              height={260}
            />
          ) : (
            <EmptyState icon="chart" title="No donations yet" body="The chart fills in once the campaign starts and donations arrive." />
          )}
        </Card>
        <Card>
          <CardHeader title="Top donors" subtitle="Named for your team only" />
          {topDonors.length ? (
            <ol className="space-y-3">
              {topDonors.map(([donorId, cents], i) => {
                const donor = lookups.donor.get(donorId);
                return (
                  <li key={donorId} className="flex items-center gap-3">
                    <span className="w-4 text-sm font-semibold text-gz-muted">{i + 1}</span>
                    <Avatar name={donorName(donor)} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{donorName(donor)}</span>
                    <span className="text-sm font-semibold">{rand(cents)}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-gz-muted">No donations yet.</p>
          )}
          <p className="mt-4 text-xs text-gz-muted">Donors who chose to be anonymous are never named on the public campaign page.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Donations to this campaign" />
        <DataTable
          caption="Donations to this campaign"
          rows={donations}
          rowKey={(d) => d.id}
          onRowClick={setOpen}
          rowLabel={(d) => `Open donation ${d.ref}`}
          initialSort={{ key: "date", dir: "desc" }}
          pageSize={10}
          columns={[
            { key: "donor", header: "Donor", sort: (d) => donorName(lookups.donor.get(d.donorId)), cell: (d) => <span className="font-semibold">{donorName(lookups.donor.get(d.donorId))}</span> },
            { key: "date", header: "Donated", sort: (d) => d.donatedAt, cell: (d) => date(d.donatedAt) },
            { key: "kind", header: "Type", cell: (d) => (d.kind === "monthly" ? "Monthly" : "Once-off") },
            { key: "status", header: "Status", cell: (d) => <DonationStatusBadge status={d.status} /> },
            { key: "amount", header: "Amount", align: "right", sort: (d) => d.amountCents, cell: (d) => <span className="font-semibold">{rand(d.amountCents)}</span> },
          ]}
          mobile={(d) => (
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">{donorName(lookups.donor.get(d.donorId))}</span>
                <span className="block text-xs text-gz-muted">{date(d.donatedAt)}</span>
              </span>
              <span className="text-right">
                <span className="block font-semibold">{rand(d.amountCents)}</span>
                <DonationStatusBadge status={d.status} />
              </span>
            </span>
          )}
          empty={<EmptyState icon="donations" title="No donations yet" body="Share the campaign link to get the first one." />}
        />
      </Card>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit campaign" description="Changes are saved in this browser for the demo.">
        <CampaignForm data={data} campaign={campaign} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </Modal>
      <ShareModal open={sharing} onClose={() => setSharing(false)} link={link} name={campaign.name} charity={data.charity.shortName} />
      <DonationDrawer donation={open} onClose={() => setOpen(null)} data={data} />
    </div>
  );
}

function ShareModal({ open, onClose, link, name, charity }: { open: boolean; onClose: () => void; link: string; name: string; charity: string }) {
  const { toast } = usePortal();
  const message = `${charity} is raising money for "${name}". Every bit helps: ${link}`;
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    toast({ tone: "success", title: `${what} copied` });
  };
  return (
    <Modal open={open} onClose={onClose} title="Share this campaign" description="The address is a demo placeholder until the live domain is chosen.">
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-semibold">Campaign link</p>
          <div className="flex items-center gap-2 rounded-2xl border border-gz-hairline bg-gz-cream p-2 pl-3.5">
            <Icon name="link" size={16} className="shrink-0 text-gz-muted" />
            <span className="min-w-0 flex-1 truncate text-sm">{link}</span>
            <Button size="sm" onClick={() => copy(link, "Link")}>
              Copy
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Message for WhatsApp or email</p>
          <p className="rounded-2xl border border-gz-hairline bg-gz-cream p-3.5 text-sm">{message}</p>
          <Button variant="secondary" size="sm" className="mt-2" icon="copy" onClick={() => copy(message, "Message")}>
            Copy message
          </Button>
        </div>
        <Callout tone="info">In the live portal this panel would also offer a QR code for posters and a preview of the public page.</Callout>
      </div>
    </Modal>
  );
}
