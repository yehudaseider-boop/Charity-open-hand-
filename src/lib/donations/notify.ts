import "server-only";
import { donationReceivedEmail, notifyCharity } from "@/lib/charity/emails";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmationEmail } from "./confirmation-email";
import { dedicationFrom, dedicationLine } from "./dedication";

/**
 * Called once, when a donation is confirmed paid (by the webhook or the
 * gateway check). Emails the donor their confirmation. A failed email never
 * undoes the payment: it is logged for the team to resend.
 */
export async function notifyDonationPaid(donationId: string, opts: { monthly?: "activated" | "not_reusable" | "none" } = {}) {
  try {
    const { data: d, error } = await createAdminClient()
      .from("donations")
      .select("id, amount_cents, contribution_cents, total_charged_cents, paid_at, wants_18a, recurring_id, dedication_kind, dedication_name, charities(name_en), donation_checkout_details(email)")
      .eq("id", donationId)
      .single();
    if (error) throw error;
    const charity = d.charities as unknown as { name_en: string };
    const details = d.donation_checkout_details as unknown as { email: string } | { email: string }[] | null;
    const email = (Array.isArray(details) ? details[0] : details)?.email;
    if (!email || !d.paid_at) return;
    let monthly: Parameters<typeof confirmationEmail>[0]["monthly"];
    if (d.recurring_id) {
      if (opts.monthly === "not_reusable") monthly = { kind: "not_started" };
      else if (opts.monthly === "activated") {
        const { data: r } = await createAdminClient().from("recurring_donations").select("charge_day, card_last4").eq("id", d.recurring_id).maybeSingle();
        monthly = { kind: "first", chargeDay: r?.charge_day ?? 1, cardLast4: r?.card_last4 ?? null };
      } else {
        // A later collection says "monthly donation". The first payment of a monthly donation that
        // never started (no monthly set-up happened) is just a gift, and says so.
        const { data: r } = await createAdminClient().from("recurring_donations").select("first_donation_id").eq("id", d.recurring_id).maybeSingle();
        monthly = r?.first_donation_id === d.id ? undefined : { kind: "repeat" };
      }
    }
    const site = process.env.SITE_URL;
    const m = confirmationEmail({
      monthly,
      manageUrl: site ? `${site.replace(/\/+$/, "")}/account` : undefined,
      id: d.id,
      charityName: charity.name_en,
      amountCents: Number(d.amount_cents),
      contributionCents: Number(d.contribution_cents),
      totalCents: Number(d.total_charged_cents),
      paidAt: d.paid_at,
      wants18a: d.wants_18a,
      dedication: (() => {
        const ded = dedicationFrom(d.dedication_kind, d.dedication_name);
        return ded ? dedicationLine(ded) : null;
      })(),
    });
    await getEmailTransport().send({ to: email, ...m });
  } catch (e) {
    console.error(`[notify] confirmation email for donation ${donationId} failed`, e);
  }
  await notifyCharityOfDonation(donationId);
}

/** Tell the charity a donation came in, unless it turned these emails off. Never blocks or undoes anything. */
async function notifyCharityOfDonation(donationId: string) {
  try {
    const db = createAdminClient();
    const { data: d, error } = await db
      .from("donations")
      .select("amount_cents, paid_at, recurring_id, charity_id, campaign_id, challenge_id, charities(name_en)")
      .eq("id", donationId)
      .single();
    if (error) throw error;
    if (!d.paid_at) return;
    const { data: priv } = await db.from("charity_private").select("contact_email, notify_donations").eq("charity_id", d.charity_id).maybeSingle();
    if (!priv?.contact_email || priv.notify_donations === false) return;
    const charity = d.charities as unknown as { name_en: string };
    // Read on its own: donations point at campaigns through two keys, which makes an embedded read ambiguous.
    const campaign = d.campaign_id ? (await db.from("campaigns").select("title").eq("id", d.campaign_id).maybeSingle()).data : null;
    const challenge = d.challenge_id ? (await db.from("group_challenges").select("title").eq("id", d.challenge_id).maybeSingle()).data : null;
    await notifyCharity(donationReceivedEmail(priv.contact_email, {
      charityName: charity.name_en,
      charityId: d.charity_id,
      amountCents: Number(d.amount_cents),
      monthly: Boolean(d.recurring_id),
      campaignTitle: campaign?.title ?? null,
      challengeTitle: challenge?.title ?? null,
    }));
  } catch (e) {
    console.error(`[notify] charity email for donation ${donationId} failed`, e);
  }
}
