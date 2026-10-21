import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { listDeposits } from "@/lib/charity/deposit-queries";
import { depositsCsv } from "@/lib/charity/deposits-csv";
import { loadCharityForManager } from "@/lib/charity/queries";

/** Every recent deposit, line by line, for the bookkeeper. */
export async function GET(_req: Request, ctx: RouteContext<"/charity-admin/[id]/donations/deposits/csv">) {
  const { id } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donations/deposits`);
  await loadCharityForManager(id);
  return new NextResponse(depositsCsv(await listDeposits(id, 1000)), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="deposits.csv"', "cache-control": "no-store" },
  });
}
