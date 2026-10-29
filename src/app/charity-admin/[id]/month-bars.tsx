"use client";

import Link from "next/link";
import { useState } from "react";
import { chartScale, monthsFrom } from "@/lib/charity/overview";
import { formatRand } from "@/lib/money";

export type MonthBar = { month: string; amountCents: number; donationCount: number; monthlyCents: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const gifts = (n: number) => `${n} ${n === 1 ? "donation" : "donations"}`;
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const shortMonth = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3);

/** The Donations page, showing the paid donations of one month (yyyy-mm-01). */
export function monthDonationsHref(donationsBase: string, month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${donationsBase}?${new URLSearchParams({ status: "paid", period: "custom", from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` })}`;
}

const H = 220; // the drawing's height; it stretches to the card's width
const PAD = 10;

/** A smooth line through the points that never dips below or above them (monotone cubic), so a month of nothing stays at nothing. */
function smooth(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const slope = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = [slope[0]];
  for (let i = 1; i < n - 1; i++) t.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  t.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / slope[i];
    const b = t[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * slope[i]; t[i + 1] = k * b * slope[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

type Period = "12" | "6" | "tax";

/**
 * Donations by month as a line over time, with a switch between the last 12 months, the last 6 and this tax
 * year. Hover, tap or tab to a month for its exact figures, and one more tap opens those donations
 * (decided 28/10/2026, redrawn 29/10/2026). Starts on the current month so the box is never empty.
 */
export function DonationsChart({ months, current, donationsBase, taxYearFrom, taxYearName }: { months: MonthBar[]; current: string; donationsBase: string; taxYearFrom: string; taxYearName: string }) {
  const [period, setPeriod] = useState<Period>("12");
  const shown = period === "12" ? months : period === "6" ? months.slice(-6) : monthsFrom(months, taxYearFrom);
  const [picked, setPicked] = useState(() => months.find((m) => m.month.startsWith(current))?.month ?? months[months.length - 1]?.month);
  const active = shown.find((m) => m.month === picked) ?? shown[shown.length - 1];

  const n = shown.length;
  const { top, ticks } = chartScale(Math.max(0, ...shown.map((m) => m.amountCents)));
  const x = (i: number) => ((i + 0.5) / n) * 1000;
  const y = (cents: number) => PAD + (1 - cents / top) * (H - 2 * PAD);
  const total = shown.reduce((t, m) => t + m.amountCents, 0);
  const count = shown.reduce((t, m) => t + m.donationCount, 0);
  const anything = shown.some((m) => m.amountCents > 0);
  const totalPts = shown.map((m, i) => [x(i), y(m.amountCents)] as [number, number]);
  const monthlyPts = shown.map((m, i) => [x(i), y(m.monthlyCents)] as [number, number]);
  const activeIndex = active ? shown.indexOf(active) : -1;
  const periods: { key: Period; label: string }[] = [
    { key: "12", label: "12 months" },
    { key: "6", label: "6 months" },
    { key: "tax", label: "Tax year" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums">{formatRand(total)}</p>
          <p className="mt-1 text-sm text-muted">
            {n ? `${shortMonth(shown[0].month)} ${shown[0].month.slice(0, 4)} to ${shortMonth(shown[n - 1].month)} ${shown[n - 1].month.slice(0, 4)}` : ""} · {gifts(count)}
            {period === "tax" ? ` · ${taxYearName} tax year` : ""}
          </p>
        </div>
        <div role="group" aria-label="Period" className="inline-flex gap-1 rounded-control bg-honey-soft p-1">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`min-h-9 rounded-[0.8rem] px-3 text-sm font-semibold transition ${period === p.key ? "bg-surface text-brand shadow-sm" : "text-muted hover:text-indigo"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-brand" />All donations</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-honey" />Monthly donations</span>
      </div>

      {!anything ? (
        <p className="rounded-control bg-honey-soft p-4 text-sm text-muted">No paid donations in this period yet. They appear here once the first one comes in.</p>
      ) : (
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2">
          {/* The y-axis: the amounts the gridlines stand for. */}
          <div className="relative text-right text-[11px] text-muted tabular-nums" style={{ height: H }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>{formatRand(t)}</span>
            ))}
          </div>
          <div className="relative" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} aria-hidden className={`absolute inset-x-0 border-t-2 ${t === 0 ? "border-border" : "border-dashed border-border/70"}`} style={{ top: y(t) }} />
            ))}
            <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
              {n > 1 ? <path d={`${smooth(totalPts)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="fill-brand/10" /> : null}
              {n > 1 ? <path d={smooth(monthlyPts)} fill="none" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-honey" /> : null}
              {n > 1 ? <path d={smooth(totalPts)} fill="none" strokeWidth="3.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-brand" /> : null}
            </svg>
            {/* The month under the pointer: a guide line, a dot on the line and its figures. */}
            {active && activeIndex >= 0 ? (
              <>
                <span aria-hidden className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-honey" style={{ left: `${(x(activeIndex) / 1000) * 100}%` }} />
                <span aria-hidden className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-brand shadow" style={{ left: `${(x(activeIndex) / 1000) * 100}%`, top: y(active.amountCents) }} />
                <span
                  aria-hidden
                  className="pointer-events-none absolute z-10 whitespace-nowrap rounded-control bg-indigo px-3 py-2 text-xs leading-snug text-white shadow-lg"
                  style={{ left: `${Math.min(86, Math.max(14, (x(activeIndex) / 1000) * 100))}%`, top: Math.max(26, y(active.amountCents)) - 12, transform: "translate(-50%, -100%)" }}
                >
                  <span className="block opacity-75">{monthName(active.month)}</span>
                  <span className="block font-display text-sm font-bold">{formatRand(active.amountCents)}</span>
                  <span className="block opacity-75">{gifts(active.donationCount)}{active.monthlyCents ? ` · ${formatRand(active.monthlyCents)} monthly` : ""}</span>
                </span>
              </>
            ) : null}
            {/* One button per month: the whole column answers to hover, a tap and the keyboard. */}
            <div role="group" aria-label="Donations by month. Choose a month to see its figures." className="absolute inset-0 flex">
              {shown.map((m) => (
                <button
                  key={m.month}
                  type="button"
                  aria-pressed={m.month === active?.month}
                  aria-label={`${monthName(m.month)}: ${formatRand(m.amountCents)}, ${gifts(m.donationCount)}`}
                  onClick={() => setPicked(m.month)}
                  onMouseEnter={() => setPicked(m.month)}
                  onFocus={() => setPicked(m.month)}
                  className="h-full min-w-0 flex-1 cursor-pointer rounded-lg outline-offset-[-3px] transition-colors hover:bg-brand/5 focus-visible:bg-brand/5 aria-pressed:bg-brand/5"
                />
              ))}
            </div>
            <div className="absolute inset-x-0 flex" style={{ top: H + 6 }} aria-hidden>
              {shown.map((m) => (
                <span key={m.month} className={`min-w-0 flex-1 text-center text-[11px] ${m.month === active?.month ? "font-bold text-brand" : m.month.startsWith(current) ? "font-semibold text-indigo" : "text-muted"}`}>
                  {shortMonth(m.month)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {anything ? (
        <div aria-live="polite" className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control border-2 border-border bg-surface px-4 py-3 text-sm">
          {active ? (
            <>
              <p>
                <span className="font-semibold text-indigo">{monthName(active.month)}{active.month.startsWith(current) ? " so far" : ""}:</span>{" "}
                {formatRand(active.amountCents)}, {gifts(active.donationCount)}
                {active.monthlyCents ? <span className="text-muted"> ({formatRand(active.monthlyCents)} monthly, {formatRand(active.amountCents - active.monthlyCents)} once-off)</span> : null}
              </p>
              {active.donationCount ? (
                <Link href={monthDonationsHref(donationsBase, active.month)} className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4">
                  See {active.donationCount === 1 ? "this donation" : `these ${active.donationCount} donations`}
                </Link>
              ) : (
                <p className="text-muted">No paid donations this month.</p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
