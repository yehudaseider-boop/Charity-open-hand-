"use client";

import Link from "next/link";
import { useMemo } from "react";
import { attentionItems, type AttentionItem, type AttentionKind } from "../data/selectors";
import type { DemoDataset } from "../data/types";
import { usePortal } from "../store";
import { count, permille, rand, randWhole } from "../ui/format";
import { Icon, type IconName } from "../ui/icons";
import { Card, CardHeader, cx } from "../ui/primitives";
import { BASE } from "../ui/shell";
import { FOLLOW_UP_NEW_DAYS } from "../data/demo-config";

const STYLE: Record<AttentionKind, { icon: IconName; tone: string }> = {
  monthly_stopped: { icon: "alert", tone: "bg-gz-danger-soft text-gz-danger" },
  campaign_behind: { icon: "flag", tone: "bg-gz-warning-soft text-gz-warning" },
  campaign_ending: { icon: "clock", tone: "bg-gz-blue-soft text-gz-blue" },
  large_donation: { icon: "donations", tone: "bg-gz-lilac-soft text-gz-ink" },
  new_donors: { icon: "spark", tone: "bg-gz-blue-soft text-gz-blue" },
  giving_less: { icon: "arrowDown", tone: "bg-gz-warning-soft text-gz-warning" },
};

function words(i: AttentionItem): { title: string; detail: string; href: string; action: string } {
  const n = count(i.count);
  switch (i.kind) {
    case "monthly_stopped":
      return { title: `${n} monthly ${i.count === 1 ? "donation" : "donations"} stopped after failed payments`, detail: `${rand(i.amountCents ?? 0)} a month lost in the last 30 days. Givezy tried three times and emailed each donor. A personal call can help them start again.`, href: `${BASE}/recurring?status=failed`, action: "See who" };
    case "campaign_behind":
      return { title: `${i.campaignName} is behind pace`, detail: `${permille(i.progressPermille ?? 0)} of the goal. It needs ${rand(i.neededPerDayCents ?? 0)} a day for the next ${count(i.daysLeft ?? 0)} days.`, href: `${BASE}/campaigns/${i.campaignId}`, action: "Open" };
    case "campaign_ending":
      return { title: `${i.campaignName} ends in ${count(i.daysLeft ?? 0)} ${i.daysLeft === 1 ? "day" : "days"}`, detail: `${permille(i.progressPermille ?? 0)} of the goal reached so far.`, href: `${BASE}/campaigns/${i.campaignId}`, action: "Open" };
    case "large_donation":
      return { title: `${n} large ${i.count === 1 ? "donation" : "donations"} to thank`, detail: `${randWhole(i.amountCents ?? 0)} in total. A personal thank-you means the most here.`, href: `${BASE}/donors?view=follow-up&tab=large`, action: "Draft thank-yous" };
    case "giving_less":
      return { title: `${n} ${i.count === 1 ? "donor is" : "donors are"} giving less often`, detail: "They used to give most months. A personal check-in now is the best chance to keep them.", href: `${BASE}/donors?view=follow-up&tab=checkin`, action: "Draft check-ins" };
    case "new_donors":
      return { title: `${n} first-time ${i.count === 1 ? "donor" : "donors"} to welcome`, detail: `They first gave in the last ${FOLLOW_UP_NEW_DAYS} days. A thank-you in the first week matters most.`, href: `${BASE}/donors?view=follow-up&tab=new`, action: "Draft welcomes" };
  }
}

/** The day's short list: things a person can act on now. Rows come from the same data as every other screen. */
export function AttentionCard({ data }: { data: DemoDataset }) {
  const { largeDonationCents, overrides } = usePortal();
  const handled = overrides.followUps;
  const items = useMemo(() => attentionItems(data, { largeCents: largeDonationCents, handled: handled ?? {} }), [data, largeDonationCents, handled]);

  return (
    <Card>
      <CardHeader title="Needs attention" subtitle={items.length ? "Things worth a few minutes today, most urgent first." : undefined} />
      {items.length ? (
        <ul className="grid gap-x-8 divide-y divide-gz-hairline lg:grid-cols-2 lg:divide-y-0">
          {items.slice(0, 6).map((i) => {
            const w = words(i);
            return (
              <li key={i.key} className="lg:border-b lg:border-gz-hairline lg:last:border-b-0 lg:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <Link href={w.href} className="group flex items-start gap-3 py-3.5">
                  <span className={cx("mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full", STYLE[i.kind].tone)}>
                    <Icon name={STYLE[i.kind].icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gz-ink group-hover:text-gz-blue">{w.title}</span>
                    <span className="mt-0.5 block text-sm text-gz-muted">{w.detail}</span>
                  </span>
                  <span className="mt-1 hidden shrink-0 items-center gap-1 text-sm font-semibold text-gz-blue sm:inline-flex">
                    {w.action}
                    <Icon name="chevronRight" size={16} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-gz-success-soft p-4 text-gz-success">
          <Icon name="check" size={20} />
          <p className="text-sm font-semibold">You are all caught up. Nothing needs you today.</p>
        </div>
      )}
      {items.length > 6 && <p className="mt-2 text-xs text-gz-muted">And {count(items.length - 6)} more.</p>}
    </Card>
  );
}
