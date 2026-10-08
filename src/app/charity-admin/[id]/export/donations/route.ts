import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { addressLine, donationStatus, donorName, isDonationStatus } from "@/lib/charity/dashboard";
import { DONATION_FIELDS, type DonationRow } from "@/lib/charity/dashboard-queries";
import { audit, authoriseExport, csvResponse } from "@/lib/charity/export";
import { centsToPlain, toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const HEADER = ["Date", "Reference", "Status", "Donor", "Donor type", "Registration number", "Email", "Phone", "Address", "Amount (R)", "s18A receipt requested", "Anonymous publicly", "Message"];

/** All of a charity's donations as a CSV, for their bookkeeper. Optional ?status=paid. */
export async function GET(request: NextRequest, ctx: RouteContext<"/charity-admin/[id]/export/donations">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;

  const raw = request.nextUrl.searchParams.get("status") ?? "";
  const status = isDonationStatus(raw) ? raw : null;
  const supabase = await createClient();
  const rows: DonationRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from("charity_donations").select(DONATION_FIELDS).eq("charity_id", id).order("created_at", { ascending: false }).order("id").range(from, from + 999);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return new NextResponse("Could not read the donations.", { status: 500 });
    rows.push(...((data ?? []) as unknown as DonationRow[]));
    if (!data || data.length < 1000) break;
  }

  await audit({ actorUserId: who.userId, action: "charity.donations_exported", entityType: "charity", entityId: id, details: { rows: rows.length, status } });
  const csv = toCsv(
    HEADER,
    rows.map((d) => [
      formatDate(d.paid_at ?? d.created_at),
      d.id,
      donationStatus[d.status].label,
      donorName(d),
      d.donor_type,
      d.registration_number,
      d.email,
      d.phone,
      addressLine(d),
      centsToPlain(d.amount_cents),
      d.wants_18a ? "Yes" : "No",
      d.is_anonymous ? "Yes" : "No",
      d.message,
    ]),
  );
  return csvResponse(csv, `donations${status ? `-${status}` : ""}.csv`);
}
