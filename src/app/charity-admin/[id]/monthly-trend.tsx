import Link from "next/link";
import { Card } from "@/components/card";
import { saDate } from "@/lib/charity/dashboard";
import type { MonthlyRow } from "@/lib/charity/dashboard";
import { monthlyTrend } from "@/lib/charity/insights";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { MonthlyTrendChart } from "./monthly-trend-chart";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 2026" for yyyy-mm-01. */
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** Monthly giving over the last 12 months: how many donors give monthly, what they bring in, who joined and who left. */
export function MonthlyTrend({ rows, now, seeAllHref }: { rows: MonthlyRow[]; now: Date; seeAllHref?: string }) {
  const points = monthlyTrend(rows, saDate(now), now, 12);
  const current = points[points.length - 1];
  const before = points[points.length - 2];
  const anything = points.some((p) => p.running > 0 || p.started > 0 || p.stopped > 0 || p.paused > 0);

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
          {/* The bars, to touch: the orange outline slides to the month chosen, with its figures above (22/11/2026). The
              list underneath has every month in words. Both run oldest to newest, this month last. */}
          <MonthlyTrendChart points={points} />
          <ul className="mt-4 space-y-1 text-sm">
            {points.filter((p) => p.running > 0 || p.started > 0 || p.stopped > 0 || p.paused > 0).map((p, i, shown) => {
              const moves = [p.started ? `${p.started} new` : "", p.stopped ? `${p.stopped} stopped` : "", p.paused ? `${p.paused} paused` : ""].filter(Boolean).join(", ");
              return (
                <li key={p.month} className={`flex justify-between gap-3 ${i === shown.length - 1 ? "font-semibold" : ""}`}>
                  <span>{monthLabel(p.month)}{i === shown.length - 1 && p.month === current.month ? " so far" : ""}</span>
                  <span className="text-right">
                    {plural(p.running, "donor")}, {formatRand(p.runningCents)} <span className="font-normal text-muted">{moves ? `(${moves})` : ""}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {seeAllHref ? <Link href={seeAllHref} className="hit mt-3 inline-block text-sm text-brand underline">See every monthly donor</Link> : null}
          <p className="mt-3 text-xs text-muted">Each month shows who was giving at its end (today, for this month). A donor who is paused now is counted as paused from the day they paused.</p>
        </>
      )}
    </Card>
  );
}
