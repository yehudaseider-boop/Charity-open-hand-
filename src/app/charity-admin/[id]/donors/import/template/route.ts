import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { CONTACT_TEMPLATE_HEADINGS } from "@/lib/charity/contacts";
import { loadCharityForManager } from "@/lib/charity/queries";
import { toCsv } from "@/lib/csv";

/** The donor import template: our headings and one made-up example row to copy. */
export async function GET(_req: Request, ctx: RouteContext<"/charity-admin/[id]/donors/import/template">) {
  const { id } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donors/import`);
  await loadCharityForManager(id);
  const example = ["Sarah", "Example", "", "sarah@example.co.za", "082 123 4567", "5 Example Road", "", "Example Suburb", "Johannesburg", "2192", "Met at the open day", "Volunteer; Newsletter"];
  return new NextResponse(toCsv(CONTACT_TEMPLATE_HEADINGS, [example]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="givezy-donor-import-template.csv"', "cache-control": "no-store" },
  });
}
