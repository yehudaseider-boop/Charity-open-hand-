import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cameInBy } from "@/lib/charity/recorded-gifts";
import { addressLine, donationStatus, donorName, shownEmail } from "@/lib/charity/dashboard";
import { applyDonationFilters, parseDonationFilters, periodText } from "@/lib/charity/donation-filters";
import { DONATION_FIELDS, loadCampaignTitles, type DonationRow } from "@/lib/charity/dashboard-queries";
import { giftSourceLabel } from "@/lib/donations/source";
import { audit, authoriseExport, csvResponse } from "@/lib/charity/export";
import { centsToPlain, toCsv, csvPhone } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { dedicationFrom, dedicationLine } from "@/lib/donations/dedication";
import { donationReference } from "@/lib/donations/reference";

const HEADER = ["Date", "Reference", "Status", "Tax year", "Donor", "Donor type", "Registration number", "Email", "Phone", "Address", "Amount (R)", "s18A receipt requested", "Anonymous publicly", "Dedication", "Message", "How it came in", "Your reference", "Campaign", "Came from"];

/**
 * A charity's donations as a CSV, for their bookkeeper. Paid donations only unless asked
 * (?status=all, or one status), so adding up the Amount column gives the income received.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/charity-admin/[id]/export/donations">) {
  const { id } = await ctx.params;
  const who = await authoriseExport(id);
  if (who instanceof NextResponse) return who;

  // The same filters as the Donations page. No status given means paid only.
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filters = parseDonationFilters({ ...params, status: params.status ?? "paid" });
  const status = filters.status === "all" ? null : filters.status;
  const supabase = await createClient();
  const rows: DonationRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await applyDonationFilters(
      supabase.from("charity_donations").select(DONATION_FIELDS).eq("charity_id", id).order("created_at", { ascending: false }).order("id").range(from, from + 999),
      filters,
    );
    if (error) return new NextResponse("Could not read the donations.", { status: 500 });
    rows.push(...((data ?? []) as unknown as DonationRow[]));
    if (!data || data.length < 1000) break;
  }

  const campaigns = await loadCampaignTitles(id).catch(() => null);
  if (!campaigns) return new NextResponse("Could not read the campaigns.", { status: 500 });
  await audit({ actorUserId: who.userId, action: "charity.donations_exported", entityType: "charity", entityId: id, details: { rows: rows.length, status, period: periodText(filters), search: Boolean(filters.q), campaign: filters.campaign || null, source: filters.source || null } });
  const csv = toCsv(
    HEADER,
    rows.map((d) => [
      formatDate(d.paid_at ?? d.created_at),
      donationReference(d.id),
      donationStatus[d.status].label,
      d.tax_year ? String(d.tax_year) : "",
      donorName(d),
      d.donor_type,
      d.registration_number,
      shownEmail(d.email),
      csvPhone(d.phone),
      addressLine(d),
      centsToPlain(d.amount_cents),
      d.wants_18a ? "Yes" : "No",
      d.is_anonymous ? "Yes" : "No",
      (() => {
        const ded = dedicationFrom(d.dedication_kind, d.dedication_name);
        return ded ? dedicationLine(ded) : "";
      })(),
      d.message,
      cameInBy(d.recorded_method),
      d.external_ref,
      d.campaign_id ? campaigns.get(d.campaign_id) ?? "" : "",
      giftSourceLabel(d.came_from),
    ]),
  );
  return csvResponse(csv, `donations-${status ?? "all"}${filters.fromDate ? `-${filters.fromDate}-to-${filters.toDate}` : ""}.csv`);
}
