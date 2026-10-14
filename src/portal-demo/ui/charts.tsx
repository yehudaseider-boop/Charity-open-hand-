"use client";

/**
 * Charts drawn as plain SVG (no chart library). Every chart has a hover or tap tooltip,
 * a legend when it shows two or more series, and a "Table" view with the same numbers.
 *
 * Series colours, in fixed order (checked for colour-blind separation with the dataviz
 * validator): blue, deep lilac, sage, orange. Orange is low contrast, so it never carries
 * a series without a legend and the table view.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./primitives";

export const SERIES_COLOURS = {
  blue: "var(--gz-blue)",
  lilac: "var(--gz-lilac-mark)",
  sage: "var(--gz-sage)",
  orange: "var(--gz-orange)",
} as const;

export type SeriesColour = keyof typeof SERIES_COLOURS;

export type Series = { name: string; colour: SeriesColour; values: number[] };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Round axis maximum and step: 4 gridlines at 1, 2, 2.5 or 5 times a power of ten. */
function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: step * Math.ceil(max / step), step };
}

export function Legend({ series }: { series: { name: string; colour: SeriesColour }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gz-muted">
      {series.map((s) => (
        <li key={s.name} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ background: SERIES_COLOURS[s.colour] }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

type TipState = { index: number; x: number; y: number } | null;

function Tooltip({ tip, title, rows, width }: { tip: TipState; title: string; rows: { name: string; colour: SeriesColour; value: string }[]; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 90), width - 90);
  return (
    <div className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-full rounded-xl border border-gz-hairline bg-gz-surface px-3 py-2 text-xs shadow-gz-lg" style={{ left, top: Math.max(tip.y - 10, 4) }} role="status">
      <p className="mb-1 font-semibold text-gz-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center justify-between gap-4 text-gz-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: SERIES_COLOURS[r.colour] }} />
            {r.name}
          </span>
          <span className="font-semibold text-gz-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Chart and table toggle, shared by all charts. */
export function ChartFrame({ chart, table, legend, height }: { chart: ReactNode; table: ReactNode; legend?: ReactNode; height: number }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-h-5">{legend}</div>
        <div className="inline-flex rounded-full bg-gz-neutral-soft p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Show as">
          {(["chart", "table"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cx("min-h-10 rounded-full px-3 sm:min-h-7 sm:px-2.5", view === v ? "bg-gz-surface text-gz-blue shadow-sm" : "text-gz-muted")}>
              {v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </div>
      {view === "chart" ? chart : <div className="overflow-auto" style={{ maxHeight: height + 40 }}>{table}</div>}
    </div>
  );
}

function ChartTable({ labels, series, format }: { labels: string[]; series: Series[]; format: (v: number) => string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-gz-muted">
          <th className="py-1.5 font-semibold">Period</th>
          {series.map((s) => (
            <th key={s.name} className="py-1.5 text-right font-semibold">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((l, i) => (
          <tr key={l} className="border-t border-gz-hairline/70">
            <td className="py-1.5">{l}</td>
            {series.map((s) => (
              <td key={s.name} className="py-1.5 text-right font-medium">
                {format(s.values[i])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PAD = { top: 12, right: 8, bottom: 28, left: 52 };

/** Line chart (optionally filled) with a crosshair and tooltip. */
export function LineChart({ labels, tipLabels, series, format, axisFormat, height = 240, area = true }: { labels: string[]; tipLabels?: string[]; series: Series[]; format: (v: number) => string; axisFormat: (v: number) => string; height?: number; area?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const n = labels.length;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const { top, step } = niceScale(max);
  const w = Math.max(width - PAD.left - PAD.right, 10);
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v: number) => PAD.top + h - (v / top) * h;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 64))));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / box.width) * (n - 1))));
    setTip({ index: i, x: x(i), y: Math.min(...series.map((s) => y(s.values[i]))) });
  };

  const chart = (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`${series.map((s) => s.name).join(" and ")} by period`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + w} y1={y(t)} y2={y(t)} style={{ stroke: "var(--gz-grid)" }} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gz-muted text-[11px]">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) || i === n - 1 ? (
              <text key={l + i} x={x(i)} y={height - 8} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} className="fill-gz-muted text-[11px]">
                {l}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
            return (
              <g key={s.name}>
                {area && series.length === 1 && (
                  <path d={`M${x(0)},${y(0)} L${pts.join(" L")} L${x(n - 1)},${y(0)} Z`} style={{ fill: SERIES_COLOURS[s.colour], opacity: 0.1 }} />
                )}
                <polyline points={pts.join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: SERIES_COLOURS[s.colour] }} />
              </g>
            );
          })}
          {tip && (
            <g>
              <line x1={x(tip.index)} x2={x(tip.index)} y1={PAD.top} y2={PAD.top + h} strokeDasharray="3 3" style={{ stroke: "var(--gz-muted)" }} />
              {series.map((s) => (
                <circle key={s.name} cx={x(tip.index)} cy={y(s.values[tip.index])} r={5} strokeWidth={2} style={{ fill: SERIES_COLOURS[s.colour], stroke: "var(--gz-surface)" }} />
              ))}
            </g>
          )}
          <rect x={PAD.left} y={PAD.top} width={w} height={h} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} style={{ touchAction: "pan-y" }} />
        </svg>
      )}
      <Tooltip tip={tip} width={width} title={tip ? (tipLabels ?? labels)[tip.index] : ""} rows={tip ? series.map((s) => ({ name: s.name, colour: s.colour, value: format(s.values[tip.index]) })) : []} />
    </div>
  );
  return <ChartFrame height={height} legend={<Legend series={series} />} chart={chart} table={<ChartTable labels={tipLabels ?? labels} series={series} format={format} />} />;
}

/** A bar's path: rounded 4px at the data end, square at the baseline. */
function barPath(x: number, yTop: number, width: number, height: number, round: boolean): string {
  if (height <= 0) return "";
  const r = round ? Math.min(4, width / 2, height) : 0;
  return `M${x},${yTop + height} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + width - r} Q${x + width},${yTop} ${x + width},${yTop + r} V${yTop + height} Z`;
}

/** Vertical bars: one series, side by side, or stacked (2px surface gap between segments). */
export function BarChart({ labels, tipLabels, series, format, axisFormat, height = 240, stacked = false }: { labels: string[]; tipLabels?: string[]; series: Series[]; format: (v: number) => string; axisFormat: (v: number) => string; height?: number; stacked?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, x) => s + x.values[i], 0) : Math.max(...series.map((x) => x.values[i]))));
  const { top, step } = niceScale(Math.max(0, ...totals));
  const w = Math.max(width - PAD.left - PAD.right, 10);
  const h = height - PAD.top - PAD.bottom;
  const band = w / Math.max(n, 1);
  const groupW = Math.min(band * 0.68, 56);
  const y = (v: number) => PAD.top + h - (v / top) * h;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 56))));

  const chart = (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`${series.map((s) => s.name).join(" and ")} by category`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + w} y1={y(t)} y2={y(t)} style={{ stroke: "var(--gz-grid)" }} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gz-muted text-[11px]">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const gx = PAD.left + i * band + (band - groupW) / 2;
            const active = tip?.index === i;
            let base = 0;
            const bars = series.map((s, si) => {
              const v = s.values[i];
              if (stacked) {
                const y0 = y(base + v);
                const hh = y(base) - y0 - (base > 0 ? 2 : 0);
                base += v;
                const isTop = series.slice(si + 1).every((o) => o.values[i] === 0);
                return <path key={s.name} d={barPath(gx, y0, groupW, Math.max(hh, 0), isTop)} style={{ fill: SERIES_COLOURS[s.colour], opacity: tip && !active ? 0.55 : 1 }} />;
              }
              const bw = (groupW - (series.length - 1) * 2) / series.length;
              return <path key={s.name} d={barPath(gx + si * (bw + 2), y(v), bw, y(0) - y(v), true)} style={{ fill: SERIES_COLOURS[s.colour], opacity: tip && !active ? 0.55 : 1 }} />;
            });
            return (
              <g key={l + i}>
                {bars}
                {(i % labelEvery === 0 || n <= 12) && (
                  <text x={gx + groupW / 2} y={height - 8} textAnchor="middle" className="fill-gz-muted text-[11px]">
                    {l}
                  </text>
                )}
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={h}
                  fill="transparent"
                  onPointerEnter={() => setTip({ index: i, x: gx + groupW / 2, y: y(totals[i]) })}
                  onPointerDown={() => setTip({ index: i, x: gx + groupW / 2, y: y(totals[i]) })}
                  onPointerLeave={() => setTip(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip
        tip={tip}
        width={width}
        title={tip ? (tipLabels ?? labels)[tip.index] : ""}
        rows={tip ? [...series.map((s) => ({ name: s.name, colour: s.colour, value: format(s.values[tip.index]) })), ...(stacked && series.length > 1 ? [{ name: "Total", colour: "blue" as SeriesColour, value: format(totals[tip.index]) }] : [])] : []}
      />
    </div>
  );
  return <ChartFrame height={height} legend={<Legend series={series} />} chart={chart} table={<ChartTable labels={tipLabels ?? labels} series={series} format={format} />} />;
}

/** Tiny trend line for metric cards. Decorative: the card states the numbers. */
export function Sparkline({ values, colour = "blue", width = 96, height = 32 }: { values: number[]; colour?: SeriesColour; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i * width) / (values.length - 1)},${height - 2 - ((v - min) / (max - min || 1)) * (height - 4)}`);
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <polyline points={pts.join(" ")} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: SERIES_COLOURS[colour] }} />
    </svg>
  );
}

/** Horizontal bars with labels, for comparing a handful of named things. */
export function BarList({ items, format, colour = "blue" }: { items: { label: ReactNode; value: number; note?: ReactNode; key: string }[]; format: (v: number) => string; colour?: SeriesColour }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-gz-ink">{it.label}</span>
            <span className="shrink-0 font-semibold text-gz-ink">{format(it.value)}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gz-neutral-soft">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: SERIES_COLOURS[colour] }} />
          </div>
          {it.note && <p className="mt-1 text-xs text-gz-muted">{it.note}</p>}
        </li>
      ))}
    </ul>
  );
}
