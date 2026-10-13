import "server-only";
import { getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmationEmail } from "./confirmation-email";

/**
 * Called once, when a donation is confirmed paid (by the webhook or the
 * gateway check). Emails the donor their confirmation. A failed email never
 * undoes the payment: it is logged for the team to resend.
 */
export async function notifyDonationPaid(donationId: string, opts: { monthly?: "activated" | "not_reusable" | "none" } = {}) {
  try {
    const { data: d, error } = await createAdminClient()
      .from("donations")
      .select("id, amount_cents, contribution_cents, total_charged_cents, paid_at, wants_18a, recurring_id, charities(name_en), donation_checkout_details(email)")
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
      } else monthly = { kind: "repeat" };
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
    });
    await getEmailTransport().send({ to: email, ...m });
  } catch (e) {
    console.error(`[notify] confirmation email for donation ${donationId} failed`, e);
  }
}
