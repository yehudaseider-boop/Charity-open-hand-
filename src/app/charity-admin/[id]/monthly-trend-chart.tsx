"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { MonthlyTrendPoint } from "@/lib/charity/insights";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "Nov" for yyyy-mm-01. */
const shortMonth = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3);
/** "November 2026" for yyyy-mm-01. */
const longMonth = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const GAP_PX = 6;

/**
 * The monthly giving bars, to touch (22/11/2026, Yehuda: "interactive, with the orange moving"). Hover, tap or tab to a
 * month and the orange outline slides to its bar, and the line above the bars says what that month looked like. It
 * starts on this month. Each month is a button the whole column high, so it is easy to hit on a phone; a screen reader
 * hears the month's figures from the button itself. The chart is one stop for the Tab key, and the arrow keys (Home
 * and End too) move between months inside it (review 22/11/2026).
 */
export function MonthlyTrendChart({ points }: { points: MonthlyTrendPoint[] }) {
  const n = points.length;
  const last = points[n - 1]?.month;
  const [picked, setPicked] = useState(last);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const i = Math.max(0, points.findIndex((p) => p.month === picked));
  const p = points[i];
  const max = Math.max(1, ...points.map((x) => x.runningCents));
  const height = (x: MonthlyTrendPoint) => (x.runningCents ? Math.max(4, Math.round((x.runningCents / max) * 100)) : 2);
  const now = p.month === last;
  const moves = [p.started ? `${p.started} new` : "", p.stopped ? `${p.stopped} stopped` : "", p.paused ? `${p.paused} paused` : ""].filter(Boolean).join(", ");
  const choose = (x: MonthlyTrendPoint) => setPicked(x.month);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const to = e.key === "ArrowRight" || e.key === "ArrowUp" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const j = Math.min(n - 1, Math.max(0, to));
    setPicked(points[j].month);
    buttons.current[j]?.focus();
  };
  // Each column's width and place, so the outline can slide from one bar to the next.
  const col = `((100% - ${(n - 1) * GAP_PX}px) / ${n})`;

  return (
    <div className="mt-4">
      <p className="min-h-[2.75rem] rounded-control bg-honey-soft px-3 py-2 text-sm text-navy">
        <span className="font-semibold">{longMonth(p.month)}{now ? " so far" : ""}:</span>{" "}
        {p.running ? (
          <>
            {plural(p.running, "donor")} {now ? (p.running === 1 ? "gives" : "give") : p.running === 1 ? "was giving" : "were giving"}{" "}
            <span className="font-semibold">{formatRand(p.runningCents)}</span> a month
          </>
        ) : (
          "no monthly donors"
        )}
        {moves ? <span className="text-muted"> ({moves})</span> : null}
      </p>
      <div className="relative mt-3 h-32">
        <div aria-hidden className="absolute inset-0 flex items-end gap-1.5">
          {points.map((x, j) => (
            <div
              key={x.month}
              className={`min-w-0 flex-1 rounded-t-lg transition-colors duration-200 ${x.runningCents ? (j === i ? "bg-brand" : "bg-brand/75") : "bg-border"}`}
              style={{ height: x.runningCents ? `${height(x)}%` : "2px" }}
            />
          ))}
        </div>
        {/* The orange outline, sliding to the chosen month (still for anyone who asks the phone for less motion). */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 rounded-t-lg ring-2 ring-coral ring-offset-2 transition-[left,height] duration-300 ease-out motion-reduce:transition-none"
          style={{ left: `calc(${i} * (${col} + ${GAP_PX}px))`, width: `calc(${col})`, height: p.runningCents ? `${height(p)}%` : "2px" }}
        />
        <div role="group" aria-label="Monthly giving by month. Use the arrow keys to move between months." className="absolute inset-0 flex gap-1.5">
          {points.map((x, j) => (
            <button
              key={x.month}
              ref={(el) => {
                buttons.current[j] = el;
              }}
              type="button"
              tabIndex={j === i ? 0 : -1}
              aria-pressed={x.month === p.month}
              aria-label={`${longMonth(x.month)}${x.month === last ? " so far" : ""}: ${plural(x.running, "monthly donor")}, ${formatRand(x.runningCents)} a month`}
              onClick={() => choose(x)}
              onMouseEnter={() => choose(x)}
              onFocus={() => choose(x)}
              onKeyDown={onKey}
              className="min-w-0 flex-1 cursor-pointer rounded-t-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
          ))}
        </div>
      </div>
      {/* A month's name never breaks in two: on a phone with more than 6 months, every other one is shown, counting back
          from this month, as on the donations chart. The chosen month's name is always shown. */}
      <div aria-hidden className="mt-1.5 flex gap-1.5">
        {points.map((x, j) => (
          <span
            key={x.month}
            className={`min-w-0 flex-1 whitespace-nowrap text-center text-[11px] ${n > 6 && (n - 1 - j) % 2 && j !== i ? "max-sm:invisible" : ""} ${j === i ? "font-bold text-brand" : "text-muted"}`}
          >
            {shortMonth(x.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
