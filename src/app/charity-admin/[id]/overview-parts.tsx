import Link from "next/link";
import { glow } from "@/components/card";
import type { SourceCount } from "@/lib/charity/overview";

/** The small pieces of the Overview that need no browser code: a figure with its trend, bars, a goal ring. */

/** A trend line for a figure. Drawn only with two or more points: one point is not a trend. */
export function Sparkline({ values, className = "text-brand" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 84;
  const h = 34;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 4 - ((v - min) / (max - min || 1)) * (h - 10)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className={`h-8 w-16 shrink-0 ${className}`}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="currentColor" />
    </svg>
  );
}

/** One big figure. The first (strong) one is blue with a splash, as on the logo. */
export function Kpi({
  label,
  value,
  note,
  change,
  changeNote,
  trend,
  href,
  strong = false,
}: {
  label: string;
  value: string;
  note?: string;
  /** How it compares with the period before; left out when there is nothing to compare with. */
  change?: { percent: number; up: boolean } | null;
  changeNote?: string;
  trend?: number[];
  /** Where the figure's detail is: the whole box opens it. */
  href: string;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-card border-2 p-5 ${glow} ${strong ? "border-brand bg-brand text-white hover:border-brand hover:shadow-brand/30" : "border-border bg-surface"}`}
    >
      {strong ? <span aria-hidden className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-honey/60 transition-transform duration-300 motion-safe:group-hover:scale-110" /> : null}
      <div className="relative space-y-1.5">
        <p className={`text-sm font-semibold ${strong ? "text-white/85" : "text-muted"}`}>{label}</p>
        <div className="flex items-end justify-between gap-3">
          <p className="whitespace-nowrap font-display text-[1.7rem] font-extrabold leading-none tracking-tight tabular-nums">{value}</p>
          {trend ? <Sparkline values={trend} className={strong ? "text-white" : "text-brand"} /> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {note ? <p className={`text-sm ${strong ? "text-white/85" : "text-muted"}`}>{note}</p> : null}
          {change ? (
            <p
              className={`rounded-full px-2 py-0.5 text-sm font-bold ${strong ? "bg-white/20 text-white" : change.up ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
            >
              <span aria-hidden>{change.up ? "↑" : "↓"} </span>
              {change.percent}%<span className="sr-only"> {change.up ? "up" : "down"}{changeNote ? ` ${changeNote}` : ""}</span>
            </p>
          ) : null}
        </div>
        <p className={`text-xs font-semibold opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 ${strong ? "text-white" : "text-brand"}`} aria-hidden>
          See the detail →
        </p>
      </div>
    </Link>
  );
}

/** Horizontal bars for "where gifts came from". The count is always shown beside the bar. */
export function SourceBars({ rows, hrefFor }: { rows: SourceCount[]; hrefFor: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="-mx-2 space-y-1">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={hrefFor(r.key)} className="group block space-y-1.5 rounded-control px-2 py-1.5 transition hover:bg-honey-soft focus-visible:bg-honey-soft">
          <div className="flex justify-between gap-3 text-sm">
            <span className="group-hover:font-semibold group-hover:text-brand">{r.label}</span>
            <span className="font-semibold tabular-nums">
              {r.count} <span className="font-normal text-muted">{r.percent}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-honey-soft group-hover:bg-surface" aria-hidden>
            <div className="h-2 rounded-full bg-brand transition-all group-hover:bg-coral" style={{ width: `${Math.max(3, Math.round((r.count / max) * 100))}%` }} />
          </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A campaign's progress as a ring: orange on a pale track, the percentage in words beside it. */
export function GoalRing({ percent, title, line, href }: { percent: number; title: string; line: string; href: string }) {
  const p = Math.max(0, Math.min(100, percent));
  const c = 2 * Math.PI * 15.5;
  return (
    <li>
      <Link href={href} className="group -mx-2 flex items-center gap-4 rounded-control px-2 py-1.5 transition hover:bg-honey-soft focus-visible:bg-honey-soft">
      <svg viewBox="0 0 36 36" aria-hidden className="h-16 w-16 shrink-0 -rotate-90 transition-transform duration-300 motion-safe:group-hover:scale-110">
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4.5" className="stroke-border" />
        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4.5" strokeLinecap="round" className="stroke-coral" strokeDasharray={`${(c * p) / 100} ${c}`} />
      </svg>
      <div className="min-w-0 text-sm">
        <span className="block truncate font-semibold text-indigo group-hover:text-brand group-hover:underline">{title}</span>
        <p className="text-muted">{line}</p>
        <p className="text-muted">{p}% of the goal</p>
      </div>
      </Link>
    </li>
  );
}
