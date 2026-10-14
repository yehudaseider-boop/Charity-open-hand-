"use client";

import type { ReactNode } from "react";
import { Sparkline, type SeriesColour } from "./charts";
import { change } from "./format";
import { Icon, type IconName } from "./icons";
import { cx, Skeleton } from "./primitives";

/** A headline figure with its change against the previous period and an optional trend line. */
export function MetricCard({
  label,
  value,
  icon,
  delta,
  deltaLabel = "vs previous period",
  goodWhenDown = false,
  trend,
  trendColour,
  note,
  highlight,
}: {
  label: string;
  value: ReactNode;
  icon?: IconName;
  /** Change in tenths of a percent, or null when there is nothing to compare. */
  delta?: number | null;
  deltaLabel?: string;
  goodWhenDown?: boolean;
  trend?: number[];
  trendColour?: SeriesColour;
  note?: ReactNode;
  /** The one accent card on a screen. */
  highlight?: boolean;
}) {
  const good = delta == null ? null : goodWhenDown ? delta <= 0 : delta >= 0;
  return (
    <div className={cx("relative overflow-hidden rounded-[22px] border p-5 shadow-gz", highlight ? "border-transparent bg-gz-blue text-white" : "border-gz-hairline bg-gz-surface")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cx("text-sm font-semibold", highlight ? "text-white/85" : "text-gz-muted")}>{label}</p>
        {icon && (
          <span className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-full", highlight ? "bg-white/15 text-white" : "bg-gz-blue-soft text-gz-blue")}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <p className={cx("mt-2 text-[28px] font-semibold leading-none tracking-tight sm:text-[30px]", highlight ? "text-white" : "text-gz-ink")} style={{ fontFamily: "var(--font-fredoka)" }}>
        {value}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 text-xs">
          {delta != null && (
            <p className="flex flex-wrap items-center gap-1">
              <span
                className={cx(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
                  highlight ? "bg-white/15 text-white" : good ? "bg-gz-success-soft text-gz-success" : "bg-gz-danger-soft text-gz-danger",
                )}
              >
                <Icon name={delta >= 0 ? "arrowUp" : "arrowDown"} size={12} />
                {change(delta)}
              </span>
              <span className={highlight ? "text-white/75" : "text-gz-muted"}>{deltaLabel}</span>
            </p>
          )}
          {note && <p className={cx("mt-1", highlight ? "text-white/80" : "text-gz-muted")}>{note}</p>}
        </div>
        {trend && !highlight && <Sparkline values={trend} colour={trendColour} />}
      </div>
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="rounded-[22px] border border-gz-hairline bg-gz-surface p-5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-36" />
      <Skeleton className="mt-4 h-3 w-24" />
    </div>
  );
}
