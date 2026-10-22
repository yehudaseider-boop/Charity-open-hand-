import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { loadSavedCardInfo } from "@/lib/donations/saved-card";
import { hitRateLimit } from "@/lib/rate-limit";
import { signedInWithPassword } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * "Download my information" (POPIA section 23): everything we hold about the
 * signed-in person, read through row-level security so it can only ever be
 * their own. Encrypted values are decrypted for them; card details we never had.
 * Two things only the server may read are added for their own donations: the
 * details typed at checkout and the agreements ticked there.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Givezy signs people in with an emailed code only; a password session gets nothing (src/lib/auth.ts).
  // An expired session gets the sign-in page, not a bare line of text.
  if (!user || (await signedInWithPassword(supabase))) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/account/data")}`, request.url), { status: 303 });
  if (await hitRateLimit("data-export", [`user:${user.id}`], 5, 60)) {
    return new NextResponse("Too many downloads. Please try again in an hour.", { status: 429 });
  }

  const [profile, donors, kinds, consents, requests, favourites, maaserSettings, income, external, notes] = await Promise.all([
    supabase.from("profiles").select("email, full_name, giver_type, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("donors").select("id, email, donor_type, first_name, last_name, phone, organisation_name, registration_number, contact_person, id_number_last4, tax_reference_last4, address_line1, address_line2, suburb, city, postal_code, age_confirmed_18_at, popia_consent_at, created_at").eq("user_id", user.id),
    supabase.from("donation_giving_kinds").select("donation_id, kind, label"),
    supabase.from("consents").select("kind, policy_version, accepted_at").eq("user_id", user.id).order("accepted_at"),
    supabase.from("data_requests").select("kind, details, status, response, created_at, closed_at").eq("user_id", user.id),
    supabase.from("favourites").select("created_at, charities(name_en)").eq("user_id", user.id),
    supabase.from("maaser_settings").select("target_percent_ppm, updated_at").eq("user_id", user.id),
    supabase.from("maaser_income_entries").select("entry_date, amount_encrypted, note_encrypted, created_at").eq("user_id", user.id),
    supabase.from("external_giving_entries").select("entry_date, amount_cents, recipient_text, label, created_at").eq("user_id", user.id),
    supabase.from("donation_private_notes").select("donation_id, note, created_at").eq("user_id", user.id),
  ]);

  // A download with a missing part would look complete, so any read that fails stops it.
  const failed = [profile, donors, kinds, consents, requests, favourites, maaserSettings, income, external, notes].find((r) => r.error);
  if (failed) return new NextResponse("We couldn't put your information together just now. Please try again in a few minutes.", { status: 503 });

  // Filter by this person's own donor records: a platform admin's access to
  // everyone's donations must not end up in their personal download.
  const donorIds = (donors.data ?? []).map((d) => d.id as string);
  const donations: Record<string, unknown>[] = [];
  for (let page = 0; donorIds.length; page += 1000) {
    const { data, error } = await supabase
      .from("donations")
      .select("id, created_at, paid_at, status, amount_cents, contribution_cents, total_charged_cents, wants_18a, is_anonymous, message, dedication_kind, dedication_name, tax_year, popia_consent_at, age_confirmed_at, charities(name_en)")
      .in("donor_id", donorIds)
      .order("created_at")
      .order("id")
      .range(page, page + 999);
    if (error) return new NextResponse("We couldn't put your information together just now. Please try again in a few minutes.", { status: 503 });
    donations.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  // Charities' personal thank-you notes to this person (a server-only table).
  const thanks = donorIds.length
    ? await createAdminClient().from("charity_donor_thanks").select("body, sent_at, charities(name_en)").in("donor_id", donorIds).order("sent_at")
    : { data: [], error: null };
  if (thanks.error) return new NextResponse("We couldn't put your information together just now. Please try again in a few minutes.", { status: 503 });
  const [myReceipts, monthly] = donorIds.length
    ? await Promise.all([
        supabase.from("s18a_receipts").select("id, tax_year, amount_cents, issued_at, status, reference:details->>receipt_reference, donor_as_printed:details->donor").in("donor_id", donorIds),
        supabase
          .from("recurring_donations")
          .select("id, created_at, status, amount_cents, contribution_cents, charge_day, next_charge_at, card_brand, card_last4, card_exp, wants_18a, is_anonymous, message, dedication_kind, dedication_name, ended_reason, charities(name_en)")
          .in("donor_id", donorIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (myReceipts.error || monthly.error) return new NextResponse("We couldn't put your information together just now. Please try again in a few minutes.", { status: 503 });

  // Per-donation details and checkout agreements are platform-admin-only tables, so they are read with
  // the service role, strictly for the donation ids established above as this person's own.
  const donationIds = donations.map((d) => d.id as string);
  const checkoutDetails: Record<string, unknown>[] = [];
  const checkoutAgreements: Record<string, unknown>[] = [];
  const admin = createAdminClient();
  for (let i = 0; i < donationIds.length; i += 500) {
    const ids = donationIds.slice(i, i + 500);
    const [details, agreements] = await Promise.all([
      admin
        .from("donation_checkout_details")
        .select("donation_id, donor_type, email, first_name, last_name, organisation_name, registration_number, contact_person, phone, id_number_last4, tax_reference_last4, address_line1, address_line2, suburb, city, postal_code, created_at")
        .in("donation_id", ids)
        .is("erased_at", null),
      admin.from("consents").select("kind, policy_version, accepted_at, donation_id").in("donation_id", ids).order("accepted_at"),
    ]);
    if (details.error || agreements.error) return new NextResponse("We couldn't put your information together just now. Please try again in a few minutes.", { status: 503 });
    checkoutDetails.push(...((details.data ?? []) as Record<string, unknown>[]));
    checkoutAgreements.push(...((agreements.data ?? []) as Record<string, unknown>[]));
  }
  const open = (v: string | null) => {
    if (!v) return null;
    try {
      return decrypt(v);
    } catch {
      return "[could not be read]";
    }
  };

  // The saved card, as brand, last four digits and expiry only. The stored token is never included.
  const savedCard = await loadSavedCardInfo(user.id).catch(() => null);

  const body = {
    about: "Everything Givezy holds about you, as at the time of download. Amounts are in cents (R1 = 100). Times are UTC.",
    downloaded_at: new Date().toISOString(),
    account: profile.data,
    // ID and tax numbers as their last 4 digits only: a donor record can be shared by everyone who gave with one email.
    donor_details: donors.data ?? [],
    donations,
    // What was typed with each donation (for its s18A receipt and the donor's own record).
    donation_details: checkoutDetails,
    monthly_donations: monthly.data ?? [],
    saved_card: savedCard,
    giving_kinds: kinds.data ?? [],
    s18a_receipts: myReceipts.data ?? [],
    agreements: [...(consents.data ?? []), ...checkoutAgreements],
    thank_you_notes_from_charities: thanks.data ?? [],
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
      "Content-Disposition": 'attachment; filename="my-givezy-information.json"',
      "Cache-Control": "no-store",
    },
  });
}
