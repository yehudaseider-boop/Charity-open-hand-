import { NextResponse } from "next/server";
import { audit, authoriseExport, csvResponse } from "@/lib/charity/export";
import { KEEPING_CSV_HEADER, keepingCsvRows, keepingListKey, keepingWindow, keepingYearKey } from "@/lib/charity/keeping-donors";
import { KeepingNotSetUp, loadKeepingDonors } from "@/lib/charity/keeping-donors-queries";
import { toCsv } from "@/lib/csv";

/** One keeping-donors list (?list=lybunt, sybunt, more or less; ?year=this or last), as a CSV. */
export async function GET(request: Request, ctx: RouteContext<"/charity-admin/[id]/export/keeping-donors">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;

  const sp = new URL(request.url).searchParams;
  const list = keepingListKey(sp.get("list"));
  const w = keepingWindow(keepingYearKey(sp.get("year")), new Date());
  let rows;
  try {
    rows = await loadKeepingDonors(id, w);
  } catch (e) {
    const msg = e instanceof KeepingNotSetUp ? "This list isn't switched on yet. Nothing was downloaded." : "Could not read this list. Nothing was downloaded. Please try again.";
    return new NextResponse(msg, { status: e instanceof KeepingNotSetUp ? 503 : 500 });
  }
  const out = keepingCsvRows(rows, list);
  await audit({ actorUserId: who.userId, action: "charity.keeping_donors_exported", entityType: "charity", entityId: id, details: { rows: out.length, list, taxYear: w.taxYear } });
  return csvResponse(toCsv(KEEPING_CSV_HEADER, out), `donors-${list}-${w.taxYear}.csv`);
}
