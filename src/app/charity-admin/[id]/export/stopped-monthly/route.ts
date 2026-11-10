import { NextResponse } from "next/server";
import { audit, authoriseExport, csvResponse, refusal } from "@/lib/charity/export";
import { LAPSED_CSV_HEADER, lapsedCsvRows, lapsedPeriod, lapsedPeriodKey } from "@/lib/charity/lapsed-monthly";
import { loadLapsedMonthly } from "@/lib/charity/lapsed-monthly-queries";
import { toCsv } from "@/lib/csv";

/** Monthly donors who stopped in the chosen period (?period=tax-year, last-tax-year or 30-days), as a CSV. */
export async function GET(request: Request, ctx: RouteContext<"/charity-admin/[id]/export/stopped-monthly">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;

  const period = lapsedPeriod(lapsedPeriodKey(new URL(request.url).searchParams.get("period")), new Date());
  let rows;
  try {
    rows = await loadLapsedMonthly(id, period);
  } catch {
    return refusal("We couldn't read the monthly donors who stopped, so nothing was downloaded. It's usually a dropped connection: go back and try the download again in a moment.", 500, `/charity-admin/${id}/monthly/stopped`, "Back to the list");
  }
  await audit({ actorUserId: who.userId, action: "charity.stopped_monthly_exported", entityType: "charity", entityId: id, details: { rows: rows.length, period: period.key } });
  return csvResponse(toCsv(LAPSED_CSV_HEADER, lapsedCsvRows(rows)), `monthly-donors-who-stopped-${period.key}.csv`);
}
