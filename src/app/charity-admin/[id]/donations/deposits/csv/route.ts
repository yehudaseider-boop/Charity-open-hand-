import type { NextRequest } from "next/server";
import { requireViewer } from "@/lib/auth";
import { listDeposits } from "@/lib/charity/deposit-queries";
import { DEPOSIT_AMOUNT_COLUMNS, depositTable, depositsCsv, xeroStatementCsv } from "@/lib/charity/deposits-csv";
import { csvResponse, xlsxResponse } from "@/lib/charity/export";
import { loadCharityForManager } from "@/lib/charity/queries";
import { toXlsx } from "@/lib/xlsx";

/** Every recent deposit for the bookkeeper: line by line (CSV, or Excel with ?format=xlsx), or for Xero (?format=xero). */
export async function GET(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/donations/deposits/csv">) {
  const { id } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donations/deposits`);
  await loadCharityForManager(id);
  const deposits = await listDeposits(id, 1000);
  const format = req.nextUrl.searchParams.get("format");
  if (format === "xero") return csvResponse(xeroStatementCsv(deposits), "deposits-for-xero.csv");
  if (format === "xlsx") {
    const t = depositTable(deposits);
    return xlsxResponse(toXlsx("Deposits", t.header, t.rows, DEPOSIT_AMOUNT_COLUMNS), "deposits.xlsx");
  }
  return csvResponse(depositsCsv(deposits), "deposits.csv");
}
