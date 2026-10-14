"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DEMO_TODAY } from "../data/demo-config";
import { daysBetween } from "../data/day";
import { campaignStats, type CampaignStats } from "../data/selectors";
import type { Campaign, CampaignStatus, DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { BarList } from "../ui/charts";
import { count, date, permille, randWhole } from "../ui/format";
import { SearchInput } from "../ui/form";
import { ConfirmDialog } from "../ui/overlay";
import { Button, ButtonLink, Card, CardHeader, cx, EmptyState, PageHeader, Progress } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { campaignLink } from "./campaign-form";
import { CampaignStatusBadge, Loaded } from "./common";

export function CampaignsView() {
  return <Loaded>{(data) => <Campaigns data={data} />}</Loaded>;
}

const TABS: { value: "all" | CampaignStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Drafts" },
  { value: "paused", label: "Paused" },
  { value: "ended", label: "Ended" },
];

const ORDER: Record<CampaignStatus, number> = { active: 0, paused: 1, draft: 2, ended: 3 };

function Campaigns({ data }: { data: DemoDataset }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("all");
  const [q, setQ] = useState("");
  const stats = useMemo(() => campaignStats(data).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.raisedCents - a.raisedCents), [data]);
  const shown = stats.filter((c) => (tab === "all" || c.status === tab) && c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const general = data.donations.filter((d) => d.status === "paid" && !d.campaignId).reduce((s, d) => s + d.amountCents, 0);

  return (
    <div className="gz-fade-in">
      <PageHeader
        title="Campaigns"
        subtitle="Raise for something specific. Each campaign has its own page, link, goal and figures."
        actions={
          <ButtonLink href={`${BASE}/campaigns/new`} icon="plus">
            New campaign
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-full border border-gz-hairline bg-gz-surface p-1" role="tablist" aria-label="Campaign status">
          {TABS.map((t) => {
            const n = t.value === "all" ? stats.length : stats.filter((c) => c.status === t.value).length;
            return (
              <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cx("min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold", tab === t.value ? "bg-gz-blue text-white" : "text-gz-muted hover:text-gz-blue")}>
                {t.label} <span className={tab === t.value ? "text-white/75" : "text-gz-muted/70"}>{n}</span>
              </button>
            );
          })}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search campaigns" label="Search campaigns" />
      </div>

      {shown.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <CampaignCard key={c.id} c={c} data={data} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon="flag" title="No campaigns here" body={q ? "No campaign matches that search." : "Nothing with this status yet."} action={<ButtonLink href={`${BASE}/campaigns/new`} size="sm" icon="plus">New campaign</ButtonLink>} />
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Compare campaigns" subtitle="Raised so far, all time. The general fund is donations not linked to a campaign." />
        <BarList
          format={randWhole}
          items={[
            ...stats.filter((c) => c.status !== "draft").map((c) => ({ key: c.id, label: c.name, value: c.raisedCents, note: `${count(c.donorCount)} donors · ${permille(c.progressPermille)} of goal` })),
            { key: "general", label: "General fund", value: general, note: "No goal" },
          ].sort((a, b) => b.value - a.value)}
        />
      </Card>
    </div>
  );
}

const COVER: Record<CampaignStatus, string> = {
  active: "bg-gz-blue-soft",
  paused: "bg-gz-warning-soft",
  draft: "bg-gz-neutral-soft",
  ended: "bg-gz-lilac-soft",
};

function timing(c: Campaign): string {
  if (c.status === "draft") return c.startDate > DEMO_TODAY ? `Planned for ${date(`${c.startDate}T12:00:00Z`)}` : "Not published";
  if (c.status === "ended") return c.endDate ? `Ended ${date(`${c.endDate}T12:00:00Z`)}` : "Ended";
  if (!c.endDate) return "No end date";
  const left = daysBetween(DEMO_TODAY, c.endDate);
  return left >= 0 ? `${count(left)} days left` : `End date passed ${date(`${c.endDate}T12:00:00Z`)}`;
}

function CampaignCard({ c, data }: { c: CampaignStats; data: DemoDataset }) {
  const { toast } = usePortal();
  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      <Link href={`${BASE}/campaigns/${c.id}`} className={cx("relative block h-24 px-5 pt-4", COVER[c.status])}>
        <CampaignStatusBadge status={c.status} />
        <span aria-hidden className="absolute bottom-3 right-5 text-4xl font-semibold text-gz-blue/15" style={{ fontFamily: "var(--font-fredoka)" }}>
          {permille(c.progressPermille)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <Link href={`${BASE}/campaigns/${c.id}`} className="text-lg font-semibold leading-snug text-gz-ink hover:text-gz-blue" style={{ fontFamily: "var(--font-fredoka)" }}>
          {c.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-gz-muted">{c.summary}</p>
        <div className="mt-auto pt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              <strong className="text-base">{randWhole(c.raisedCents)}</strong> <span className="text-gz-muted">raised</span>
            </span>
            <span className="text-gz-muted">of {randWhole(c.goalCents)}</span>
          </div>
          <Progress permille={c.progressPermille} className="mt-2" label={`${c.name} progress`} />
          <p className="mt-2 text-xs text-gz-muted">
            {count(c.donorCount)} donors · {timing(c)}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href={`${BASE}/campaigns/${c.id}`} variant="soft" size="sm">
              Open
            </ButtonLink>
            <Button
              variant="ghost"
              size="sm"
              icon="link"
              onClick={() => {
                const link = campaignLink(data.charity.publicSlug, c.slug);
                navigator.clipboard?.writeText(link).catch(() => undefined);
                toast({ tone: "success", title: "Link copied (demo address)", body: link });
              }}
            >
              Copy link
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Status buttons for a campaign: publish, pause, resume, end, reopen. Asks before pausing or ending. */
export function CampaignStatusActions({ campaign }: { campaign: Campaign }) {
  const { setCampaignStatus, toast } = usePortal();
  const [ask, setAsk] = useState<null | "paused" | "ended">(null);
  const change = (status: CampaignStatus, title: string, body: string) => {
    setCampaignStatus(campaign.id, status);
    toast({ tone: "success", title, body });
  };
  return (
    <>
      {campaign.status === "draft" && (
        <Button icon="check" onClick={() => change("active", "Campaign published (demo)", "It now shows as active everywhere in the portal. Nothing was published for real.")}>
          Publish
        </Button>
      )}
      {campaign.status === "active" && (
        <Button variant="secondary" icon="pause" onClick={() => setAsk("paused")}>
          Pause
        </Button>
      )}
      {campaign.status === "paused" && (
        <Button icon="play" onClick={() => change("active", "Campaign resumed", "Donors can give to it again.")}>
          Resume
        </Button>
      )}
      {(campaign.status === "active" || campaign.status === "paused") && (
        <Button variant="secondary" icon="flag" onClick={() => setAsk("ended")}>
          End campaign
        </Button>
      )}
      {campaign.status === "ended" && (
        <Button variant="secondary" icon="refresh" onClick={() => change("active", "Campaign reopened", "It is active again.")}>
          Reopen
        </Button>
      )}
      <ConfirmDialog
        open={ask === "paused"}
        onClose={() => setAsk(null)}
        onConfirm={() => change("paused", "Campaign paused", "Its page now says donations are paused.")}
        title="Pause this campaign?"
        body="Donors will not be able to give to it until you resume it. Everything raised so far stays."
        confirmLabel="Pause campaign"
      />
      <ConfirmDialog
        open={ask === "ended"}
        onClose={() => setAsk(null)}
        onConfirm={() => change("ended", "Campaign ended", "It moves to Ended. You can reopen it if you need to.")}
        title="End this campaign?"
        body="Its page will thank donors and stop taking donations. You can reopen it later."
        confirmLabel="End campaign"
        danger
      />
    </>
  );
}
