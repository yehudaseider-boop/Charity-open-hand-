import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { loadDeposit } from "@/lib/charity/deposit-queries";
import { DEPOSIT_AMOUNT_COLUMNS, depositTable, depositsCsv, xeroStatementCsv } from "@/lib/charity/deposits-csv";
import { authoriseExport, csvResponse, xlsxResponse } from "@/lib/charity/export";
import { toXlsx } from "@/lib/xlsx";

/** One deposit for the bookkeeper: line by line (CSV, or Excel with ?format=xlsx), or for Xero (?format=xero). */
export async function GET(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/donations/deposits/[payoutId]/csv">) {
  const { id, payoutId } = await ctx.params;
  // Donor names are in these files: the same checks, limit and audit entry as every other export.
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;
  const d = await loadDeposit(id, payoutId);
  if (!d) return new NextResponse("Not found", { status: 404 });
  const format = req.nextUrl.searchParams.get("format");
  await logAudit({ actorUserId: who.userId, action: "charity.deposits_exported", entityType: "charity", entityId: id, details: { payout: payoutId, format: format ?? "csv" } });
  if (format === "xero") return csvResponse(xeroStatementCsv([d]), `deposit-${d.paidOutOn}-for-xero.csv`);
  if (format === "xlsx") {
    const t = depositTable([d]);
    return xlsxResponse(toXlsx("Deposit", t.header, t.rows, DEPOSIT_AMOUNT_COLUMNS), `deposit-${d.paidOutOn}.xlsx`);
  }
  return csvResponse(depositsCsv([d]), `deposit-${d.paidOutOn}.csv`);
}
