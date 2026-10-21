import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { loadDeposit } from "@/lib/charity/deposit-queries";
import { depositsCsv } from "@/lib/charity/deposits-csv";
import { loadCharityForManager } from "@/lib/charity/queries";

/** One deposit, line by line, for the bookkeeper. */
export async function GET(_req: Request, ctx: RouteContext<"/charity-admin/[id]/donations/deposits/[payoutId]/csv">) {
  const { id, payoutId } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donations/deposits`);
  await loadCharityForManager(id);
  const d = await loadDeposit(id, payoutId);
  if (!d) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(depositsCsv([d]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="deposit-${d.paidOutOn}.csv"`, "cache-control": "no-store" },
  });
}
