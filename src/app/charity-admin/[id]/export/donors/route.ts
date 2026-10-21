import { NextResponse } from "next/server";
import { audit, authoriseExport, csvResponse, xlsxResponse } from "@/lib/charity/export";
import { toXlsx } from "@/lib/xlsx";
import { ERASED_DONOR, isErasedEmail, shownEmail } from "@/lib/charity/dashboard";
import { loadDonors } from "@/lib/charity/dashboard-queries";
import { centsToPlain, toCsv, csvPhone } from "@/lib/csv";
import { formatDate } from "@/lib/dates";

const HEADER = ["Donor", "Donor type", "Email", "Phone", "Donations", "Total (R)", "First donation", "Last donation", "s18A receipt requested", "Anonymous publicly"];

/** A charity's donors (people who have given) as a CSV, or Excel with ?format=xlsx. */
export async function GET(request: Request, ctx: RouteContext<"/charity-admin/[id]/export/donors">) {
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
  const table = donors.map((d) => [
      isErasedEmail(d.email) ? ERASED_DONOR : d.display_name,
      d.donor_type,
      shownEmail(d.email),
      csvPhone(d.phone),
      d.donation_count,
      centsToPlain(d.total_cents),
      formatDate(d.first_paid_at),
      formatDate(d.last_paid_at),
      d.wants_18a ? "Yes" : "No",
      d.is_anonymous ? "Yes" : "No",
    ]);
  if (new URL(request.url).searchParams.get("format") === "xlsx") return xlsxResponse(toXlsx("Donors", HEADER, table, [HEADER.indexOf("Total (R)")]), "donors.xlsx");
  return csvResponse(toCsv(HEADER, table), "donors.csv");
}
