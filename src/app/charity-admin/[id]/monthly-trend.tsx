import Link from "next/link";
import { Card } from "@/components/card";
import { saDate } from "@/lib/charity/dashboard";
import type { MonthlyRow } from "@/lib/charity/dashboard";
import { monthlyTrend } from "@/lib/charity/insights";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";

/** Monthly giving over the last 12 months: how many donors give monthly, what they bring in, who joined and who left. */
export function MonthlyTrend({ rows, now, seeAllHref }: { rows: MonthlyRow[]; now: Date; seeAllHref?: string }) {
  const points = monthlyTrend(rows, saDate(now), now, 12);
  const current = points[points.length - 1];
  const before = points[points.length - 2];
  const max = Math.max(1, ...points.map((p) => p.running));
  const anything = points.some((p) => p.running > 0 || p.started > 0 || p.stopped > 0);

  return (
    <Card title="Monthly giving over time">
      {!anything ? (
        <p className="text-sm text-muted">No monthly donations yet. This fills in once a donor chooses to give every month.</p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-semibold">{plural(current.running, "donor")}</span> {current.running === 1 ? "gives" : "give"} <span className="font-semibold">{formatRand(current.runningCents)}</span> a month.
            {before && current.running !== before.running ? (
              <span className="text-muted"> {current.running > before.running ? `Up ${current.running - before.running}` : `Down ${before.running - current.running}`} on the end of last month.</span>
            ) : null}
          </p>
          {/* Bars for the eye; the list underneath is what screen readers read. */}
          <div className="mt-4 flex h-32 items-end gap-1.5" aria-hidden>
            {points.map((p, i) => (
              <div key={p.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div
                  title={`${plural(p.running, "monthly donor")}, ${formatRand(p.runningCents)} a month`}
                  className={`w-full rounded-t-lg ${p.running ? "bg-brand" : "bg-border"} ${i === points.length - 1 ? "ring-2 ring-coral ring-offset-1" : ""}`}
                  style={{ height: p.running ? `${Math.max(4, Math.round((p.running / max) * 100))}%` : "2px" }}
                />
                <span className={`text-[11px] ${i === points.length - 1 ? "font-semibold text-indigo" : "text-muted"}`}>{p.month.slice(5, 7)}</span>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            {[...points].reverse().filter((p) => p.running > 0 || p.started > 0 || p.stopped > 0).map((p) => {
              const [y, mm] = p.month.split("-");
              const moves = [p.started ? `${p.started} new` : "", p.stopped ? `${p.stopped} stopped` : ""].filter(Boolean).join(", ");
              return (
                <li key={p.month} className="flex justify-between gap-3">
                  <span>{mm}/{y}</span>
                  <span>
                    {plural(p.running, "donor")}, {formatRand(p.runningCents)} <span className="text-muted">{moves ? `(${moves})` : ""}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {seeAllHref ? <Link href={seeAllHref} className="mt-3 inline-block text-sm text-brand underline">See every monthly donor</Link> : null}
          <p className="mt-3 text-xs text-muted">Each month shows who was giving at its end (today, for this month). A donor who is paused now is counted as paused from the day they paused.</p>
        </>
      )}
    </Card>
  );
}
