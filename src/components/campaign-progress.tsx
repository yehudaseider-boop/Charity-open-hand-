import Link from "next/link";
import { progressPercent } from "@/lib/charity/campaigns";
import type { CampaignRow } from "@/lib/charity/campaign-queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

/** A campaign for donors: what it's for, how close it is to its goal, and (optionally) a Give link. */
export function CampaignProgress({ campaign: c, giveHref, compact = false }: { campaign: CampaignRow; giveHref?: string; compact?: boolean }) {
  const pct = progressPercent(c.raisedCents, c.targetCents);
  return (
    <section className="space-y-2 rounded-card border border-honey bg-honey-soft p-5">
      <p className="text-sm font-semibold text-brand">Campaign</p>
      <h2 className="text-lg font-semibold leading-snug text-indigo">{c.title}</h2>
      {!compact && c.description ? <p className="whitespace-pre-line text-[0.95rem] leading-relaxed">{c.description}</p> : null}
      <p className="text-sm">
        <span className="text-base font-semibold">{formatRand(c.raisedCents)}</span>
        {c.targetCents ? <span className="text-muted"> of {formatRand(c.targetCents)}</span> : <span className="text-muted"> raised</span>}
      </p>
      {c.targetCents ? (
        <div className="h-2.5 rounded-full bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the goal`}>
          <div className="h-2.5 rounded-full bg-brand" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
      ) : null}
      <p className="text-xs text-muted">
        {c.giftCount} {c.giftCount === 1 ? "gift" : "gifts"}{c.endsAt ? ` · until ${formatDate(c.endsAt)}` : ""}
      </p>
      {giveHref ? (
        <Link href={giveHref} className="mt-1 block rounded-control bg-brand px-4 py-2.5 text-center font-semibold text-brand-contrast">
          Give to this campaign
        </Link>
      ) : null}
    </section>
  );
}
