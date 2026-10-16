import type { Metadata } from "next";
import { Card, Notice } from "@/components/card";
import { RemoveButton } from "@/components/forms/remove-button";
import { requireViewer } from "@/lib/auth";
import { isRunning, progressPercent } from "@/lib/charity/campaigns";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { endCampaign, startCampaign } from "./actions";
import { CampaignForm } from "./forms";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ params }: PageProps<"/charity-admin/[id]/campaigns">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/campaigns`);
  const { charity } = await loadCharityForManager(id);
  const campaigns = await loadCampaigns(id);
  const now = new Date();
  const active = campaigns.filter((c) => isRunning(c, now));
  // Ended by hand, or past its last day.
  const past = campaigns.filter((c) => !isRunning(c, now) && c.status !== "draft");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <p className="text-sm text-muted">
          Raise for one thing at a time, like winter food parcels or a new roof. Donors give to it in the Givezy app or on your Givezy page, and see how close you are to the goal.
          The money comes to you like any other donation. You can run up to 3 at a time.
        </p>
      </div>

      {charity.status !== "approved" ? <Notice tone="warning">Campaigns appear to donors once your application is approved.</Notice> : null}

      {active.length < 3 ? (
        <Card title="Start a campaign">
          <CampaignForm action={startCampaign.bind(null, id)} />
        </Card>
      ) : null}

      {active.length ? (
        <Card title="Running now">
          <ul className="divide-y divide-border">
            {active.map((c) => (
              <li key={c.id} className="space-y-2 py-3">
                <div className="flex justify-between gap-3">
                  <p className="font-medium">{c.title}</p>
                  <form action={endCampaign.bind(null, id, c.id)}>
                    <RemoveButton label="End" what={c.title} confirmText={`End "${c.title}"? Donors won't be able to give to it any more. Gifts already made stay with you.`} />
                  </form>
                </div>
                <CampaignBar raised={c.raisedCents} target={c.targetCents} gifts={c.giftCount} endsAt={c.endsAt} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {past.length ? (
        <Card title="Ended">
          <ul className="divide-y divide-border">
            {past.map((c) => (
              <li key={c.id} className="space-y-2 py-3">
                <p className="font-medium">{c.title}</p>
                <CampaignBar raised={c.raisedCents} target={c.targetCents} gifts={c.giftCount} endsAt={null} />
                {c.status === "active" && c.endsAt ? <p className="text-xs text-muted">Ended on {formatDate(c.endsAt)}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function CampaignBar({ raised, target, gifts, endsAt }: { raised: number; target: number | null; gifts: number; endsAt: string | null }) {
  const pct = progressPercent(raised, target);
  return (
    <div className="space-y-1 text-sm">
      <p>
        {formatRand(raised)} raised{target ? ` of ${formatRand(target)}` : ""} <span className="text-muted">({gifts} {gifts === 1 ? "gift" : "gifts"}{endsAt ? `, until ${formatDate(endsAt)}` : ""})</span>
      </p>
      {target ? (
        <div className="h-2 rounded-full bg-honey-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the goal`}>
          <div className="h-2 rounded-full bg-honey" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      ) : null}
    </div>
  );
}
