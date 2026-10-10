import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { hitRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * "Download my information" (POPIA section 23): everything we hold about the
 * signed-in person, read through row-level security so it can only ever be
 * their own. Encrypted values are decrypted for them; card details we never had.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Please sign in.", { status: 401 });
  if (await hitRateLimit("data-export", [`user:${user.id}`], 5, 60)) {
    return new NextResponse("Too many downloads. Please try again in an hour.", { status: 429 });
  }

  const [profile, donors, kinds, consents, requests, favourites, maaserSettings, income, external, notes] = await Promise.all([
    supabase.from("profiles").select("email, full_name, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("donors").select("id, email, donor_type, first_name, last_name, phone, organisation_name, registration_number, contact_person, id_number_encrypted, tax_reference_encrypted, address_line1, address_line2, suburb, city, postal_code, created_at").eq("user_id", user.id),
    supabase.from("donation_giving_kinds").select("donation_id, kind"),
    supabase.from("consents").select("kind, policy_version, accepted_at").eq("user_id", user.id).order("accepted_at"),
    supabase.from("data_requests").select("kind, details, status, response, created_at, closed_at").eq("user_id", user.id),
    supabase.from("favourites").select("created_at, charities(name_en)").eq("user_id", user.id),
    supabase.from("maaser_settings").select("target_percent_ppm, updated_at").eq("user_id", user.id),
    supabase.from("maaser_income_entries").select("entry_date, amount_encrypted, note_encrypted, created_at").eq("user_id", user.id),
    supabase.from("external_giving_entries").select("entry_date, amount_cents, recipient_text, created_at").eq("user_id", user.id),
    supabase.from("donation_private_notes").select("donation_id, note, created_at").eq("user_id", user.id),
  ]);

  // Filter by this person's own donor records: a platform admin's access to
  // everyone's donations must not end up in their personal download.
  const donorIds = (donors.data ?? []).map((d) => d.id as string);
  const donations = donorIds.length
    ? await supabase
        .from("donations")
        .select("id, created_at, paid_at, status, amount_cents, contribution_cents, total_charged_cents, wants_18a, is_anonymous, message, tax_year, charities(name_en)")
        .in("donor_id", donorIds)
        .order("created_at")
    : { data: [] };
  const myReceipts = donorIds.length
    ? await supabase.from("s18a_receipts").select("id, tax_year, amount_cents, issued_at, status, reference:details->>receipt_reference").in("donor_id", donorIds)
    : { data: [] };
  const open = (v: string | null) => {
    if (!v) return null;
    try {
      return decrypt(v);
    } catch {
      return "[could not be read]";
    }
  };

  const body = {
    about: "Everything NEDIV lev holds about you, as at the time of download. Amounts are in cents (R1 = 100). Times are UTC.",
    downloaded_at: new Date().toISOString(),
    account: profile.data,
    donor_details: (donors.data ?? []).map(({ id_number_encrypted, tax_reference_encrypted, ...d }) => ({
      ...d,
      id_number: open(id_number_encrypted as string | null),
      tax_reference: open(tax_reference_encrypted as string | null),
    })),
    donations: donations.data ?? [],
    giving_kinds: kinds.data ?? [],
    s18a_receipts: myReceipts.data ?? [],
    agreements: consents.data ?? [],
    requests: requests.data ?? [],
    saved_charities: favourites.data ?? [],
    maaser_settings: maaserSettings.data ?? [],
    maaser_income: (income.data ?? []).map((r) => ({
      entry_date: r.entry_date,
      amount: open(r.amount_encrypted as string | null),
      note: open(r.note_encrypted as string | null),
      created_at: r.created_at,
    })),
    giving_elsewhere: external.data ?? [],
    private_notes: notes.data ?? [],
  };

  await logAudit({ actorUserId: user.id, action: "privacy.data_downloaded", entityType: "user", entityId: user.id });
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="my-nediv-lev-information.json"',
      "Cache-Control": "no-store",
    },
  });
}
