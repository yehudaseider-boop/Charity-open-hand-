"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/badge";
import { TableScroll } from "@/components/dash";

export type RecentRow = {
  id: string;
  status: "paid" | "refunded" | "charged_back" | "pending" | "failed";
  statusLabel: string;
  tone: "success" | "warning" | "danger" | "neutral";
  donor: string;
  initials: string;
  forWhat: string;
  from: string;
  date: string;
  amount: string;
  wants18a: boolean;
  href: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "refunded", label: "Refunded" },
  { key: "charged_back", label: "Charged back" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const tints = ["bg-honey", "bg-peach", "bg-brand-soft", "bg-success-soft"];

/**
 * The latest donations, filtered on the spot by what happened to them. It holds only the latest few, so
 * when a filter finds nothing among them it says so and links to the full list for that status.
 */
export function RecentDonations({ rows, donationsHref }: { rows: RecentRow[]; donationsHref: string }) {
  const router = useRouter();
  // The whole row opens the gift, except where the click means something else: the donor link itself (which
  // also handles Ctrl/Cmd-click for a new tab), a modifier key, or selecting the row's text to copy it.
  const openRow = (e: React.MouseEvent, href: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  };
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-x-1.5 gap-y-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`hit min-h-9 rounded-full border-2 px-3.5 text-sm font-semibold transition ${filter === f.key ? "border-brand bg-brand text-white" : "border-outline bg-surface text-muted hover:border-brand"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p aria-live="polite" className="rounded-control bg-honey-soft p-4 text-sm text-muted">
          None among the latest donations.{" "}
          <Link href={filter === "all" ? donationsHref : `${donationsHref}?status=${filter}`} className="font-semibold text-brand underline">See every {filter === "all" ? "donation" : FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} one</Link>.
        </p>
      ) : (
        <>
        {/* On a phone the table's last columns ran off the screen, the amount among them: one row per gift
            instead, name and amount first, then the date and status (17/11/2026). The table is unchanged from sm up. */}
        <ul className="divide-y divide-border sm:hidden">
          {shown.map((r, i) => (
            <li key={r.id}>
              <Link href={r.href} className="group -mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 text-sm transition hover:bg-honey-soft focus-visible:bg-honey-soft">
                <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-navy ${tints[i % tints.length]}`}>{r.initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-indigo group-hover:text-brand group-hover:underline"><bdi>{r.donor}</bdi></span>
                    <span className="shrink-0 font-semibold tabular-nums">{r.amount}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="tabular-nums">{r.date}</span>
                    <Badge tone={r.tone}>{r.statusLabel}</Badge>
                    {r.wants18a ? <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">s18A</span> : null}
                    <span className="min-w-0 truncate">{r.forWhat}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block">
        <TableScroll label="Recent donations table">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b-2 border-border text-left text-xs font-semibold text-muted">
                <th className="pb-2 pr-3 font-semibold">Status</th>
                <th className="pb-2 pr-3 font-semibold">Donor</th>
                <th className="pb-2 pr-3 font-semibold">For</th>
                <th className="pb-2 pr-3 font-semibold">From</th>
                <th className="pb-2 pr-3 font-semibold">Date</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} onClick={(e) => openRow(e, r.href)} className="group cursor-pointer border-b border-border transition last:border-0 hover:bg-honey-soft focus-within:bg-honey-soft">
                  <td className="whitespace-nowrap py-2.5 pr-3"><Badge tone={r.tone}>{r.statusLabel}</Badge></td>
                  <td className="py-2.5 pr-3">
                    <Link href={r.href} className="flex min-w-0 items-center gap-2.5 font-semibold text-indigo group-hover:text-brand group-hover:underline">
                      <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-navy transition-transform motion-safe:group-hover:scale-110 ${tints[i % tints.length]}`}>{r.initials}</span>
                      <span className="min-w-0 truncate"><bdi>{r.donor}</bdi></span>
                    </Link>
                  </td>
                  <td className="max-w-[11rem] truncate py-2.5 pr-3" title={r.forWhat}>{r.forWhat}</td>
                  <td className="py-2.5 pr-3">{r.from}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">{r.date}</td>
                  <td className="whitespace-nowrap py-2.5 text-right font-semibold tabular-nums">
                    {r.amount}
                    {r.wants18a ? <span className="ml-1.5 rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">s18A</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
        </div>
        </>
      )}
    </div>
  );
}
