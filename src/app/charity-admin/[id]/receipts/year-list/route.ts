import { NextResponse, type NextRequest } from "next/server";
import { audit, authoriseExport, csvResponse, xlsxResponse } from "@/lib/charity/export";
import { toCsv } from "@/lib/csv";
import { yearList } from "@/lib/receipts/year-list";
import { loadYearReceipts } from "@/lib/receipts/year-list-store";
import { toXlsx } from "@/lib/xlsx";
import { taxYearName } from "@/lib/dates";

/** The charity's draft yearly list of issued s18A receipts. Never any part of a donor's ID or tax number. */
export async function GET(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/receipts/year-list">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new NextResponse("Choose a tax year.", { status: 400 });
  const list = yearList(await loadYearReceipts(id, year), "charity");
  const xlsx = req.nextUrl.searchParams.get("format") === "xlsx";
  await audit({ actorUserId: who.userId, action: "charity.receipt_year_list_exported", entityType: "charity", entityId: id, details: { taxYear: year, receipts: list.count } });
  const name = `s18a-receipts-${year}-draft`;
  return xlsx ? xlsxResponse(toXlsx(`${taxYearName(year).replace("/", "-")} tax year`, list.header, list.rows, list.amountColumns), `${name}.xlsx`) : csvResponse(toCsv(list.header, list.rows), `${name}.csv`);
}
