import "server-only";
import { donationReceivedEmail, notifyCharity } from "@/lib/charity/emails";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { confirmationEmail } from "./confirmation-email";
import { dedicationFrom, dedicationLine } from "./dedication";
import { s18aDetailsMissing, type S18aDetailsRow } from "./s18a-details";
import { NOT_REUSABLE } from "./recurring";
import { alreadyHandled, markRetryGone, markRetryUnknown, recordFailedEmail } from "@/lib/email/retry";
import { wasCutOff } from "@/lib/email/retry-plan";

/**
 * Called once, when a donation is confirmed paid (by the webhook or the
 * gateway check). Emails the donor their confirmation. A failed email never
 * undoes the payment: it is logged for the team to resend.
 */
export async function notifyDonationPaid(donationId: string, opts: { monthly?: "activated" | "not_reusable" | "none" } = {}) {
  // Sent (or nothing to send): the note that it is owed (see oweDonorConfirmation) is closed, so it never goes twice.
  // Failed: the note stays, and the daily job tries again.
  // Already sent by the daily job's try again (or left as "may have gone" for a person): never a second copy.
  if (await alreadyHandled("donation_confirmation", donationId)) {
    await notifyCharityOfDonation(donationId);
    return;
  }
  if (await sendDonorConfirmation(donationId, opts)) await markRetryGone("donation_confirmation", donationId);
  await notifyCharityOfDonation(donationId);
}

/**
 * Called just before a gift is saved as paid: note the donor's confirmation as owed, on the same list as a failed
 * one (email_retries, kind donation_confirmation). If the process stops after the gift is saved and before the email
 * goes, the daily job's email retries send it; once notifyDonationPaid has sent it, the note is closed. There is no
 * other "confirmation sent" marker. Never throws, and does nothing before the email_retries table exists.
 */
export async function oweDonorConfirmation(donationId: string): Promise<void> {
  await recordFailedEmail("donation_confirmation", donationId);
}

/**
 * What a confirmation sent after the fact says about the monthly donation. A later collection says "monthly
 * donation". A first payment says "first payment of your monthly donation" only while it is still running (a
 * donor who has since paused or cancelled is not told we will collect again); one whose card could not be kept
 * says the monthly donation didn't start; one that never started at all is just a gift.
 */
export function monthlyLineLater(
  donationId: string,
  r: { first_donation_id: string | null; status: string; ended_reason: string | null; charge_day: number | null; card_last4: string | null } | null,
): Parameters<typeof confirmationEmail>[0]["monthly"] {
  if (!r) return undefined;
  if (r.first_donation_id !== donationId) return { kind: "repeat" };
  if (r.ended_reason === NOT_REUSABLE) return { kind: "not_started" };
  if (r.status === "active") return { kind: "first", chargeDay: r.charge_day ?? 1, cardLast4: r.card_last4 };
  return undefined;
}

/**
 * The donor's confirmation email. True when it went (or there was nothing to send); a failure is logged in the
 * audit log and noted for the daily job, which tries it again (an hour later, then a day, then three days).
 */
export async function sendDonorConfirmation(donationId: string, opts: { monthly?: "activated" | "not_reusable" | "none" } = {}): Promise<boolean> {
  try {
    await deliverDonorConfirmation(donationId, opts);
    return true;
  } catch (e) {
    console.error(`[notify] confirmation email for donation ${donationId} failed`, e);
    // The audit log is where the team finds confirmations that failed. Never let that write undo a payment.
    await logAudit({
      actorUserId: null,
      action: "donation.confirmation_email_failed",
      entityType: "donation",
      entityId: donationId,
      details: { message: e instanceof Error ? e.message : String(e) },
    }).catch((err) => console.error("[notify] could not record the failed email", err));
    // Cut off mid-send: it may have reached the donor, so it is never sent again by itself (a person checks it).
    if (wasCutOff(e)) await markRetryUnknown("donation_confirmation", donationId, e);
    else await recordFailedEmail("donation_confirmation", donationId, { error: e });
    return false;
  }
}

/**
 * Build and send the confirmation, as the gift is now. Throws when the send fails. "gone" when there is nothing
 * to send (no address, not paid, or refunded or charged back since: no "thank you for your donation" then);
 * "skipped" when nothing was sent on purpose (email off, an erased donor, or an address the test site may not
 * email).
 */
export async function deliverDonorConfirmation(
  donationId: string,
  opts: { monthly?: "activated" | "not_reusable" | "none"; signal?: AbortSignal } = {},
): Promise<"sent" | "skipped" | "gone"> {
  const { data: d, error } = await createAdminClient()
    .from("donations")
    .select("id, status, amount_cents, contribution_cents, processing_charge_cents, total_charged_cents, paid_at, wants_18a, recurring_id, dedication_kind, dedication_name, charities(name_en, thank_you_en), donation_checkout_details(email, donor_type, id_number_encrypted, tax_reference_encrypted, registration_number, address_line1)")
    .eq("id", donationId)
    .single();
  if (error) throw error;
  const charity = d.charities as unknown as { name_en: string; thank_you_en: string | null };
  const details = d.donation_checkout_details as unknown as (S18aDetailsRow & { email: string }) | (S18aDetailsRow & { email: string })[] | null;
  const row = Array.isArray(details) ? details[0] : details;
  const email = row?.email;
  if (!email || !d.paid_at || d.status !== "paid") return "gone";
  let monthly: Parameters<typeof confirmationEmail>[0]["monthly"];
  if (d.recurring_id) {
    if (opts.monthly === "not_reusable") monthly = { kind: "not_started" };
    else if (opts.monthly === "activated") {
      const { data: r } = await createAdminClient().from("recurring_donations").select("charge_day, card_last4").eq("id", d.recurring_id).maybeSingle();
      monthly = { kind: "first", chargeDay: r?.charge_day ?? 1, cardLast4: r?.card_last4 ?? null };
    } else {
      // Sent again later (the daily check resending a failed email): work out from the monthly donation as it is now.
      const { data: r } = await createAdminClient().from("recurring_donations").select("first_donation_id, status, ended_reason, charge_day, card_last4").eq("id", d.recurring_id).maybeSingle();
      monthly = monthlyLineLater(d.id, r);
    }
  }
  const site = process.env.SITE_URL;
  const m = confirmationEmail({
    monthly,
    manageUrl: site ? `${site.replace(/\/+$/, "")}/account` : undefined,
    id: d.id,
    charityName: charity.name_en,
    // The charity's own thank-you paragraph, if it wrote one. Who gets this email is unchanged.
    charityNote: charity.thank_you_en,
    amountCents: Number(d.amount_cents),
    contributionCents: Number(d.contribution_cents),
    cardChargeCents: Number(d.processing_charge_cents ?? 0),
    totalCents: Number(d.total_charged_cents),
    paidAt: d.paid_at,
    wants18a: d.wants_18a,
    // "Add my details after paying": the email says how to add them (the thank-you page's link isn't in an email).
    s18aDetailsMissing: Boolean(d.wants_18a && row && row.donor_type && s18aDetailsMissing(row).length),
    accountUrl: site ? `${site.replace(/\/+$/, "")}/account` : undefined,
    dedication: (() => {
      const ded = dedicationFrom(d.dedication_kind, d.dedication_name);
      return ded ? dedicationLine(ded) : null;
    })(),
  });
  return await getEmailTransport().send({ to: email, ...m, ...(opts.signal ? { signal: opts.signal } : {}) });
}

/** Tell the charity a donation came in, unless it turned these emails off. Never blocks or undoes anything. */
async function notifyCharityOfDonation(donationId: string) {
  try {
    const db = createAdminClient();
    const { data: d, error } = await db
      .from("donations")
      .select("amount_cents, paid_at, recurring_id, charity_id, campaign_id, charities(name_en)")
      .eq("id", donationId)
      .single();
    if (error) throw error;
    if (!d.paid_at) return;
    const { data: priv } = await db.from("charity_private").select("contact_email, notify_donations").eq("charity_id", d.charity_id).maybeSingle();
    if (!priv?.contact_email || priv.notify_donations === false) return;
    const charity = d.charities as unknown as { name_en: string };
    // Read on its own: donations point at campaigns through two keys, which makes an embedded read ambiguous.
    const campaign = d.campaign_id ? (await db.from("campaigns").select("title").eq("id", d.campaign_id).maybeSingle()).data : null;
    await notifyCharity(donationReceivedEmail(priv.contact_email, {
      charityName: charity.name_en,
      charityId: d.charity_id,
      amountCents: Number(d.amount_cents),
      monthly: Boolean(d.recurring_id),
      campaignTitle: campaign?.title ?? null,
    }));
  } catch (e) {
    console.error(`[notify] charity email for donation ${donationId} failed`, e);
  }
}
