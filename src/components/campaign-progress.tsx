import Link from "next/link";
import { progressPercent } from "@/lib/charity/campaigns";
import type { CampaignRow } from "@/lib/charity/campaign-queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

/** A campaign for donors: what it's for, how close it is to its goal, and (optionally) a Give link. */
export function CampaignProgress({ campaign: c, giveHref, compact = false }: { campaign: CampaignRow; giveHref?: string; compact?: boolean }) {
  const pct = progressPercent(c.raisedCents, c.targetCents);
  return (
    <section className="space-y-3 rounded-card border-2 border-border bg-surface p-5 sm:p-6">
      <p className="text-sm font-bold text-brand">Campaign</p>
      <h2 className="font-display text-2xl font-bold leading-tight">{c.title}</h2>
      {!compact && c.description ? <p className="whitespace-pre-line leading-relaxed text-muted">{c.description}</p> : null}
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-lg font-bold tabular-nums">
            {formatRand(c.raisedCents)}
            {c.targetCents ? <span className="text-base font-normal text-muted"> of {formatRand(c.targetCents)}</span> : <span className="text-base font-normal text-muted"> raised</span>}
          </span>
          <span className="text-sm text-muted">
            {c.giftCount} {c.giftCount === 1 ? "gift" : "gifts"}{c.endsAt ? ` · until ${formatDate(c.endsAt)}` : ""}
          </span>
        </p>
        {c.targetCents ? (
          <div className="h-3 overflow-hidden rounded-full bg-brand-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the goal`}>
            <div className="h-3 rounded-full bg-coral" style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
        ) : null}
      </div>
      {giveHref ? (
        <Link href={giveHref} className="pressable mt-1 inline-block rounded-control bg-brand px-5 py-3 font-bold text-brand-contrast">
          Give to this campaign
        </Link>
      ) : null}
    </section>
  );
}
