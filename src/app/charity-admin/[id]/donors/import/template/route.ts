import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { CONTACT_TEMPLATE_HEADINGS } from "@/lib/charity/contacts";
import { loadCharityForManager } from "@/lib/charity/queries";
import { toCsv } from "@/lib/csv";

/**
 * The donor import template: our headings and two made-up example rows to copy. A person with every optional
 * detail, and an organisation with only a name and email, so it is plain that the phone number and address may be
 * left empty. The phone number is written with spaces, which a spreadsheet keeps as text (0 at the front and all).
 */
export async function GET(_req: Request, ctx: RouteContext<"/charity-admin/[id]/donors/import/template">) {
  const { id } = await ctx.params;
  await requireViewer(`/charity-admin/${id}/donors/import`);
  await loadCharityForManager(id);
  const example = ["Sarah", "Example", "", "sarah@example.co.za", "082 123 4567", "5 Example Road", "", "Example Suburb", "Johannesburg", "2192", "Met at the open day", "Volunteer; Newsletter"];
  const organisation = ["", "", "Example Trading (Pty) Ltd", "accounts@example.co.za", "", "", "", "", "", "", "", ""];
  return new NextResponse(toCsv(CONTACT_TEMPLATE_HEADINGS, [example, organisation]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="givezy-donor-import-template.csv"', "cache-control": "no-store" },
  });
}
