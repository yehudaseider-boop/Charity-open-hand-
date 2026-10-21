import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { TEMPLATE_HEADINGS } from "@/lib/charity/recorded-gifts";
import { loadCharityForManager } from "@/lib/charity/queries";
import { toCsv } from "@/lib/csv";

/** The import template: our headings and one made-up example row to copy. */
export async function GET(_req: Request, ctx: RouteContext<"/charity-admin/[id]/donations/import/template">) {
  const { id } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donations/import`);
  await loadCharityForManager(id);
  const example = ["05/03/2026", "1250.00", "EFT", "individual", "Sarah", "Example", "", "", "sarah@example.co.za", "082 123 4567", "yes", "", "1234567890", "5 Example Road", "", "Example Suburb", "Johannesburg", "2192", "", "EXAMPLE-REF-1"];
  return new NextResponse(toCsv(TEMPLATE_HEADINGS, [example]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="givezy-gift-import-template.csv"', "cache-control": "no-store" },
  });
}
