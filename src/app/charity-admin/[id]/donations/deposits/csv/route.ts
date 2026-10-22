import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { listDeposits } from "@/lib/charity/deposit-queries";
import { DEPOSIT_AMOUNT_COLUMNS, depositTable, depositsCsv, xeroStatementCsv } from "@/lib/charity/deposits-csv";
import { authoriseExport, csvResponse, xlsxResponse } from "@/lib/charity/export";
import { toXlsx } from "@/lib/xlsx";

/** Every recent deposit for the bookkeeper: line by line (CSV, or Excel with ?format=xlsx), or for Xero (?format=xero). */
export async function GET(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/donations/deposits/csv">) {
  const { id } = await ctx.params;
  // Donor names are in these files: the same checks, limit and audit entry as every other export.
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;
  const deposits = await listDeposits(id, 1000);
  const format = req.nextUrl.searchParams.get("format");
  await logAudit({ actorUserId: who.userId, action: "charity.deposits_exported", entityType: "charity", entityId: id, details: { deposits: deposits.length, format: format ?? "csv" } });
  if (format === "xero") return csvResponse(xeroStatementCsv(deposits), "deposits-for-xero.csv");
  if (format === "xlsx") {
    const t = depositTable(deposits);
    return xlsxResponse(toXlsx("Deposits", t.header, t.rows, DEPOSIT_AMOUNT_COLUMNS), "deposits.xlsx");
  }
  return csvResponse(depositsCsv(deposits), "deposits.csv");
}
