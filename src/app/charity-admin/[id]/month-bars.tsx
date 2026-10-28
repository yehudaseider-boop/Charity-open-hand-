"use client";

import Link from "next/link";
import { useState } from "react";
import { formatRand } from "@/lib/money";

export type MonthBar = { month: string; amountCents: number; donationCount: number; monthlyCents: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const gifts = (n: number) => `${n} ${n === 1 ? "donation" : "donations"}`;

/** The Donations page, showing the paid donations of one month (yyyy-mm-01). */
export function monthDonationsHref(donationsBase: string, month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${donationsBase}?${new URLSearchParams({ status: "paid", period: "custom", from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` })}`;
}

/**
 * Donations by month that can be touched: hover or tap a month for its exact figures, and one more tap
 * opens those donations (decided 28/10/2026). Starts on the current month so the box is never empty.
 */
export function MonthBars({ months, current, donationsBase }: { months: MonthBar[]; current: string; donationsBase: string }) {
  const [picked, setPicked] = useState(() => months.find((m) => m.month.startsWith(current))?.month ?? months[months.length - 1]?.month);
  const max = Math.max(1, ...months.map((m) => m.amountCents));
  const shown = months.find((m) => m.month === picked);
  const name = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  return (
    <>
      <div className="mb-3 flex gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Monthly</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-honey" />Once-off</span>
      </div>
      <div role="group" aria-label="Donations by month. Choose a month to see its figures." className="flex h-48 items-end gap-1.5">
        {months.map((m) => {
          const h = Math.round((m.amountCents / max) * 100);
          const monthlyShare = m.amountCents ? Math.round((m.monthlyCents / m.amountCents) * 100) : 0;
          const isCurrent = m.month.startsWith(current);
          const on = m.month === picked;
          return (
            <button
              key={m.month}
              type="button"
              aria-pressed={on}
              aria-label={`${name(m.month)}: ${formatRand(m.amountCents)}, ${gifts(m.donationCount)}`}
              onClick={() => setPicked(m.month)}
              onMouseEnter={() => setPicked(m.month)}
              onFocus={() => setPicked(m.month)}
              className="group flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end gap-1 rounded-lg outline-offset-2"
            >
              <span
                className={`flex w-full flex-col-reverse overflow-hidden rounded-t-lg transition-opacity ${isCurrent ? "ring-2 ring-coral ring-offset-1" : ""} ${picked && !on ? "opacity-55 group-hover:opacity-100" : ""}`}
                style={{ height: m.amountCents ? `${Math.max(3, h)}%` : "2px" }}
              >
                <span className="block w-full bg-brand" style={{ height: `${monthlyShare}%` }} />
                <span className={`block w-full flex-1 ${m.amountCents ? "bg-honey" : "bg-border"}`} />
              </span>
              <span className={`text-[11px] ${on ? "font-bold text-brand" : isCurrent ? "font-semibold text-indigo" : "text-muted"}`}>{m.month.slice(5, 7)}</span>
            </button>
          );
        })}
      </div>
      {shown ? (
        <div aria-live="polite" className="mt-4 rounded-control border-2 border-border bg-surface p-4">
          <p className="text-sm text-muted">{name(shown.month)}{shown.month.startsWith(current) ? " so far" : ""}</p>
          <p className="font-display text-2xl font-bold tabular-nums text-indigo">{formatRand(shown.amountCents)}</p>
          {shown.donationCount ? (
            <>
              <p className="text-sm">
                {gifts(shown.donationCount)}
                {shown.monthlyCents ? <span className="text-muted">: {formatRand(shown.monthlyCents)} monthly, {formatRand(shown.amountCents - shown.monthlyCents)} once-off</span> : null}
              </p>
              <Link href={monthDonationsHref(donationsBase, shown.month)} className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
                See {shown.donationCount === 1 ? "this donation" : `these ${shown.donationCount} donations`}
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">No paid donations this month.</p>
          )}
        </div>
      ) : null}
    </>
  );
}
