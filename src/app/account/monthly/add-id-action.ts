"use server";

import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { encrypt, last4, receiptIdentity } from "@/lib/crypto";
import { taxYearFor } from "@/lib/dates";
import { cleanSaIdNumber, giftsToUpdate, needsIdNudge, SAVED_TEXT } from "@/lib/donations/monthly-id-nudge";
import type { FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { contactUs, onIssuedReceipt as onIssuedReceiptOf } from "@/lib/donations/s18a-complete";

const TRY_AGAIN = "We couldn't save your ID number. Nothing has changed. Please try again.";

/**
 * A signed-in donor adds their SA ID number to one of their own monthly donations (set up with only an
 * income tax number, before 03/11/2026). Written, server-only, onto the details every new monthly gift is
 * copied from, and onto this tax year's paid gifts of that donation that are not yet on an issued s18A
 * receipt. The tax number stays. The ID number itself is never logged: only its last four digits.
 */
export async function addMonthlyId(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer("/account");
  const recurringId = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(recurringId)) return { ok: false, message: TRY_AGAIN };
  const typed = cleanSaIdNumber(formData.get("id_number"));
  if (!typed.ok) return { ok: false, message: "Please check your ID number.", fieldErrors: { id_number: typed.message } };
  if (await hitRateLimit("monthly-id", [`user:${viewer.userId}`], 5, 60)) {
    return { ok: false, message: "You've tried this several times in the last hour. Please wait a while and try again." };
  }

  const db = createAdminClient();
  // Only this person's own monthly donations (their donor records, confirmed by signing in with an emailed code).
  const { data: donors, error: donorsError } = await db.from("donors").select("id").eq("user_id", viewer.userId);
  if (donorsError) return { ok: false, message: TRY_AGAIN };
  const donorIds = new Set((donors ?? []).map((d) => d.id as string));
  const { data: rec, error: recError } = await db
    .from("recurring_donations")
    .select("id, donor_id, status, wants_18a, first_donation_id")
    .eq("id", recurringId)
    .maybeSingle();
  if (recError) return { ok: false, message: TRY_AGAIN };
  if (!rec || !donorIds.has(rec.donor_id as string)) return { ok: false, message: "We couldn't find that monthly donation on your account. Nothing has changed." };
  const { data: source, error: sourceError } = await db
    .from("donation_checkout_details")
    .select("donation_id, donor_type, id_number_encrypted, tax_reference_encrypted, address_line1, erased_at")
    .eq("donation_id", rec.first_donation_id ?? "")
    .maybeSingle();
  if (sourceError) return { ok: false, message: TRY_AGAIN };
  if (!needsIdNudge(rec, source)) {
    return { ok: false, message: "This monthly donation doesn't need an ID number added. Nothing has changed. Refresh the page to see it as it is now." };
  }

  // Exactly as checkout records an individual's ID number: encrypted, its last four digits, and the
  // fingerprint that groups a person's gifts onto one receipt (an ID number takes over from a tax number).
  const patch = {
    id_number_encrypted: encrypt(typed.id),
    id_number_last4: last4(typed.id),
    receipt_identity: receiptIdentity({ donorType: "individual", idNumber: typed.id }),
  };
  const thisYear = taxYearFor(new Date());
  const { data: gifts, error: giftsError } = await db
    .from("donations")
    .select("id, recurring_id, donor_id, status, tax_year")
    .eq("recurring_id", recurringId)
    .eq("status", "paid")
    .eq("tax_year", thisYear);
  if (giftsError) return { ok: false, message: TRY_AGAIN };
  const sourceId = source!.donation_id as string;
  const candidateIds = (gifts ?? []).map((g) => g.id as string);
  // Shared with "Add my details after paying" (s18a-complete.ts): a gift on an issued receipt is never changed.
  // The source gift (the first one, which every new gift is copied from) is checked too: it can be on one.
  const onIssuedReceipt = await onIssuedReceiptOf(db, [...new Set([...candidateIds, sourceId])]).catch(() => null);
  if (!onIssuedReceipt) return { ok: false, message: TRY_AGAIN };
  const targets = new Set(giftsToUpdate((gifts ?? []) as Parameters<typeof giftsToUpdate>[0], { recurringId, donorIds, taxYear: thisYear, onIssuedReceipt }));
  // The source details every new monthly gift is copied from, first: once this is in, no new gift goes out without
  // the ID. Not when the source gift is on an issued receipt: that receipt is what it was issued as, and there is no
  // other place new gifts copy from, so the gifts that can be updated are, and the donor is told plainly.
  const sourceLocked = onIssuedReceipt.has(sourceId);
  if (!sourceLocked) targets.add(sourceId);
  if (!targets.size) {
    return { ok: false, message: `Your first monthly gift is already on an issued s18A receipt, so we can't add your ID number here. Nothing has changed. Please ${contactUs()} and we'll add it for you.` };
  }

  const { data: written, error: writeError } = await db
    .from("donation_checkout_details")
    .update(patch)
    .in("donation_id", [...targets])
    .is("id_number_encrypted", null)
    .is("erased_at", null)
    .eq("donor_type", "individual")
    .select("donation_id");
  if (writeError) return { ok: false, message: TRY_AGAIN };
  const updated = (written ?? []).map((w) => w.donation_id as string);
  if (sourceLocked ? !updated.length : !updated.includes(sourceId)) return { ok: false, message: TRY_AGAIN };

  await logAudit({
    actorUserId: viewer.userId,
    action: "donor.monthly_id_added",
    entityType: "recurring_donation",
    entityId: recurringId,
    details: { id_last4: patch.id_number_last4, tax_year: thisYear, gifts_updated: updated.filter((d) => d !== sourceId).length, source_on_issued_receipt: sourceLocked },
  });
  if (sourceLocked) {
    return {
      ok: true,
      message: `Saved on this tax year's gifts that aren't on an issued s18A receipt yet. Your first monthly gift is already on one, so new gifts can't carry your ID number yet. Please ${contactUs()} and we'll add it for you.`,
    };
  }
  // No revalidatePath here: the page would drop the form (the nudge no longer applies) and with it the words
  // saying what just happened. The form shows them itself; the next visit reads the page afresh.
  return { ok: true, message: SAVED_TEXT };
}
