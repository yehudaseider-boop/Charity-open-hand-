import { NextResponse, type NextRequest } from "next/server";
import { requireViewer } from "@/lib/auth";
import { loadDeposit } from "@/lib/charity/deposit-queries";
import { DEPOSIT_AMOUNT_COLUMNS, depositTable, depositsCsv, xeroStatementCsv } from "@/lib/charity/deposits-csv";
import { csvResponse, xlsxResponse } from "@/lib/charity/export";
import { loadCharityForManager } from "@/lib/charity/queries";
import { toXlsx } from "@/lib/xlsx";

/** One deposit for the bookkeeper: line by line (CSV, or Excel with ?format=xlsx), or for Xero (?format=xero). */
export async function GET(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/donations/deposits/[payoutId]/csv">) {
  const { id, payoutId } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donations/deposits`);
  await loadCharityForManager(id);
  const d = await loadDeposit(id, payoutId);
  if (!d) return new NextResponse("Not found", { status: 404 });
  const format = req.nextUrl.searchParams.get("format");
  if (format === "xero") return csvResponse(xeroStatementCsv([d]), `deposit-${d.paidOutOn}-for-xero.csv`);
  if (format === "xlsx") {
    const t = depositTable([d]);
    return xlsxResponse(toXlsx("Deposit", t.header, t.rows, DEPOSIT_AMOUNT_COLUMNS), `deposit-${d.paidOutOn}.xlsx`);
  }
  return csvResponse(depositsCsv([d]), `deposit-${d.paidOutOn}.csv`);
}
