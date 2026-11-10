import "server-only";
import { legalConfig } from "@/config/legal";
import { getEmailTransport, type EmailMessage } from "@/lib/email";
import { formatRand } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { DECLINED_REASON } from "./monthly-reasons";
import { monthlyFailedEmail } from "./monthly-email";
import { newCardLink } from "./new-card";

/** What a declined-card notice needs besides the monthly donation itself. Kept with a failed notice (no address, no name). */
export type DeclinedInfo = {
  totalCents: number;
  final: boolean;
  failedAt: string;
  /** The donation's failed tries when the notice was due. A different number now means a newer notice has its say. */
  failedAttempts?: number;
};

/** The declined-card notice: the same message whether it goes now or on a later try. */
export function declinedNotice(r: { id: string; charityName: string; cardLast4: string | null }, info: { totalCents: number; final: boolean }, now: Date) {
  const site = process.env.SITE_URL;
  return monthlyFailedEmail({
    charityName: r.charityName,
    totalText: formatRand(info.totalCents),
    cardLast4: r.cardLast4,
    final: info.final,
    manageUrl: site ? `${site.replace(/\/+$/, "")}/account` : undefined,
    newCardUrl: site ? newCardLink(site, r.id, now) : undefined,
    helpEmail: legalConfig.supportEmail,
  });
}

/** Read a kept DeclinedInfo back, or null when it doesn't look like one. */
export function declinedInfoFrom(p: Record<string, unknown>): DeclinedInfo | null {
  const totalCents = Number(p.totalCents);
  if (!Number.isInteger(totalCents) || totalCents <= 0 || typeof p.final !== "boolean" || typeof p.failedAt !== "string" || Number.isNaN(Date.parse(p.failedAt))) return null;
  const failedAttempts = p.failedAttempts === undefined ? undefined : Number(p.failedAttempts);
  if (failedAttempts !== undefined && (!Number.isInteger(failedAttempts) || failedAttempts < 1)) return null;
  return { totalCents, final: p.final, failedAt: p.failedAt, ...(failedAttempts !== undefined ? { failedAttempts } : {}) };
}

/**
 * Whether a declined-card notice still says something true. Not when the donor paused or cancelled, when a
 * gift was paid since (a new card, or the next try worked), when a "we'll try again" notice is out of date because
 * the donation has since stopped (the final notice replaces it), or when the final notice is about a donation that
 * is running again. Nor when the card was tried again since (the failed tries moved on): that try's own notice
 * says it, and two "card declined" emails for one decline would be one too many.
 */
export function declinedNoticeStillTrue(r: { status: string; ended_reason: string | null; failed_attempts?: number }, info: DeclinedInfo, paidSince: boolean): boolean {
  if (paidSince) return false;
  if (info.failedAttempts !== undefined && r.failed_attempts !== undefined && r.failed_attempts !== info.failedAttempts) return false;
  if (info.final) return r.status === "failed" && r.ended_reason === DECLINED_REASON;
  return r.status === "active";
}

/** Try a declined-card notice again (the daily job, 10/11/2026), as the monthly donation is now. */
export async function retryDeclinedNotice(recurringId: string, payload: Record<string, unknown>, signal: AbortSignal): Promise<"sent" | "skipped" | "gone"> {
  const info = declinedInfoFrom(payload);
  if (!info) return "gone";
  const db = createAdminClient();
  const { data: r, error } = await db
    .from("recurring_donations")
    .select("id, status, ended_reason, failed_attempts, card_last4, first_donation_id, charities(name_en)")
    .eq("id", recurringId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return "gone";
  const { count, error: paidError } = await db
    .from("donations")
    .select("id", { count: "exact", head: true })
    .eq("recurring_id", recurringId)
    .eq("status", "paid")
    .gt("paid_at", info.failedAt);
  if (paidError) throw new Error(paidError.message);
  if (!declinedNoticeStillTrue({ status: r.status as string, ended_reason: (r.ended_reason as string | null) ?? null, failed_attempts: Number(r.failed_attempts) }, info, (count ?? 0) > 0)) return "gone";
  const { data: d, error: emailError } = await db.from("donation_checkout_details").select("email").eq("donation_id", r.first_donation_id).maybeSingle();
  if (emailError) throw new Error(emailError.message);
  const charity = (Array.isArray(r.charities) ? r.charities[0] : r.charities) as { name_en: string } | null;
  if (!d?.email || !charity) return "gone";
  const m = declinedNotice({ id: r.id as string, charityName: charity.name_en, cardLast4: (r.card_last4 as string | null) ?? null }, info, new Date());
  const message: EmailMessage = { to: d.email as string, ...m, signal };
  return await getEmailTransport().send(message);
}
