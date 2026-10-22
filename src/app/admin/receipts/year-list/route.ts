import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { csvResponse, xlsxResponse } from "@/lib/charity/export";
import { toCsv } from "@/lib/csv";
import { yearList } from "@/lib/receipts/year-list";
import { loadYearReceipts } from "@/lib/receipts/year-list-store";
import { toXlsx } from "@/lib/xlsx";

/** Givezy's draft yearly list for one charity: checks the receipts before the SARS submission. Not the SARS file. */
export async function GET(req: NextRequest) {
  const admin = await requirePlatformAdmin();
  const charityId = req.nextUrl.searchParams.get("charity") ?? "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  if (!/^[0-9a-f-]{36}$/i.test(charityId) || !Number.isInteger(year) || year < 2020 || year > 2100) return new NextResponse("Choose a charity and a tax year.", { status: 400 });
  const list = yearList(await loadYearReceipts(charityId, year), "givezy");
  const xlsx = req.nextUrl.searchParams.get("format") === "xlsx";
  await logAudit({ actorUserId: admin.userId, action: "receipts.year_list_downloaded", entityType: "charity", entityId: charityId, details: { taxYear: year, receipts: list.count, format: xlsx ? "xlsx" : "csv" } });
  const name = `s18a-year-list-${year}-draft`;
  return xlsx ? xlsxResponse(toXlsx(`Tax year ${year}`, list.header, list.rows, list.amountColumns), `${name}.xlsx`) : csvResponse(toCsv(list.header, list.rows), `${name}.csv`);
}
