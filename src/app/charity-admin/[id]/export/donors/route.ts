import { NextResponse } from "next/server";
import { audit, authoriseExport, csvResponse } from "@/lib/charity/export";
import { loadDonors } from "@/lib/charity/dashboard-queries";
import { centsToPlain, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";

const HEADER = ["Donor", "Donor type", "Email", "Phone", "Donations", "Total (R)", "First donation", "Last donation", "s18A receipt requested", "Anonymous publicly"];

/** A charity's donors (people who have given) as a CSV. */
export async function GET(_request: Request, ctx: RouteContext<"/charity-admin/[id]/export/donors">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;

  let donors;
  try {
    donors = await loadDonors(id);
  } catch {
    return new NextResponse("Could not read the donors.", { status: 500 });
  }
  await audit({ actorUserId: who.userId, action: "charity.donors_exported", entityType: "charity", entityId: id, details: { rows: donors.length } });
  const csv = toCsv(
    HEADER,
    donors.map((d) => [
      d.display_name,
      d.donor_type,
      d.email,
      d.phone,
      d.donation_count,
      centsToPlain(d.total_cents),
      formatDate(d.first_paid_at),
      formatDate(d.last_paid_at),
      d.wants_18a ? "Yes" : "No",
      d.is_anonymous ? "Yes" : "No",
    ]),
  );
  return csvResponse(csv, "donors.csv");
}
