"use client";

/** Date-range filter: presets plus custom dates. Shared by every screen through the demo store. */
import { useEffect, useRef, useState } from "react";
import { DEMO_START, DEMO_TODAY } from "../data/demo-config";
import { showDay } from "../data/day";
import { RANGE_LABELS, type RangePreset } from "../data/selectors";
import { usePortal } from "../store";
import { Icon } from "./icons";
import { Button, cx } from "./primitives";

const PRESETS: Exclude<RangePreset, "custom">[] = ["30d", "90d", "month", "taxYear", "12m"];

export function DateRangePicker({ align = "right" }: { align?: "left" | "right" }) {
  const { range, rangePreset, setRange, toast } = usePortal();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const applyCustom = () => {
    if (!from || !to) return setError("Choose both dates.");
    if (from > to) return setError("The start date must be on or before the end date.");
    if (from < DEMO_START || to > DEMO_TODAY) return setError(`The demo has data from ${showDay(DEMO_START)} to ${showDay(DEMO_TODAY)}.`);
    setError(null);
    setRange("custom", { from, to });
    setOpen(false);
    toast({ tone: "info", title: "Date range updated", body: `${showDay(from)} to ${showDay(to)}` });
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setFrom(range.from);
          setTo(range.to);
          setError(null);
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gz-hairline bg-gz-surface px-3.5 text-sm font-semibold text-gz-ink hover:border-gz-blue/40"
      >
        <Icon name="calendar" size={16} className="text-gz-blue" />
        <span>{rangePreset === "custom" ? `${showDay(range.from)} to ${showDay(range.to)}` : RANGE_LABELS[rangePreset]}</span>
        <Icon name="chevronDown" size={14} className="text-gz-muted" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose dates" className={cx("gz-fade-in absolute z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gz-hairline bg-gz-surface p-3 shadow-gz-lg", align === "right" ? "right-0" : "left-0")}>
          <ul className="space-y-0.5">
            {PRESETS.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => {
                    setRange(p);
                    setOpen(false);
                  }}
                  className={cx("flex min-h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm", rangePreset === p ? "bg-gz-blue-soft font-semibold text-gz-blue" : "text-gz-ink hover:bg-gz-neutral-soft")}
                >
                  {RANGE_LABELS[p]}
                  {rangePreset === p && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-gz-hairline pt-3">
            <p className="mb-2 px-1 text-xs font-semibold text-gz-muted">Custom dates</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gz-muted">
                From
                <input type="date" value={from} min={DEMO_START} max={DEMO_TODAY} onChange={(e) => setFrom(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-gz-hairline px-2 text-sm text-gz-ink" />
              </label>
              <label className="text-xs text-gz-muted">
                To
                <input type="date" value={to} min={DEMO_START} max={DEMO_TODAY} onChange={(e) => setTo(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-gz-hairline px-2 text-sm text-gz-ink" />
              </label>
            </div>
            {error && (
              <p className="mt-2 text-xs text-gz-danger" role="alert">
                {error}
              </p>
            )}
            <Button size="sm" className="mt-3 w-full" onClick={applyCustom}>
              Apply dates
            </Button>
          </div>
          <p className="mt-2 px-1 text-[11px] text-gz-muted">Shown in dd/mm/yyyy, Johannesburg time. Tax year runs 01/03 to 28/02.</p>
        </div>
      )}
    </div>
  );
}
