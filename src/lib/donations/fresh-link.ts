import "server-only";
import { platformConfig } from "@/config/platform";
import { EmailMaybeSent, getEmailTransport, type EmailMessage } from "@/lib/email";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/ids";
import { confirmationAccess, reissueConfirmationToken } from "./confirmation-access";

/**
 * "Email me a fresh link" (decided 23/11/2026). The link a donor comes back on after paying works for
 * platformConfig.confirmationLink.days; after that its page offers a fresh one. The fresh link goes only to the email
 * address the gift was made with (never to an address typed on the page), and only when asked with the expired link
 * itself. The answer is the same whether or not the gift, its email or a sent email exist, so the button can't be
 * used to find out anything about a gift or a donor.
 */

export type FreshLinkState =
  | { ok: false; message?: string }
  | { ok: true; message: string };

/** The one answer for every request that was not refused by a limit (sent, or nothing to send). */
export const FRESH_LINK_SENT = `If this link belongs to a donation, we've emailed a fresh link to the email address the donation was made with. It works for ${platformConfig.confirmationLink.days} days. It can take a few minutes to arrive, so check your spam folder too. Nothing else has changed.`;

export const FRESH_LINK_LIMITED = "You've asked for a fresh link several times already, so nothing was sent this time. Please try again later, or sign in with the email you gave with to see this donation in your account.";

/** The email with the fresh link. Pure, tested. */
export function freshLinkEmail(to: string, link: string, charityName: string | null, days: number = platformConfig.confirmationLink.days): EmailMessage {
  const gift = charityName ? `your donation to ${charityName}` : "your donation";
  return {
    to,
    subject: "Your fresh link to your Givezy donation",
    text: [
      `You asked for a fresh link to ${gift}. Open it to see the donation and, if its s18A receipt still needs your details, to add them:`,
      "",
      link,
      "",
      `For your safety the link works for ${days} days, and only for this donation. You can also see all your giving by signing in with this email address.`,
      "",
      "If you didn't ask for this, you can ignore this email. Nothing has changed.",
      "",
      "The Givezy team",
    ].join("\n"),
  };
}

type Deps = {
  now?: Date;
  /** For tests: how the email leaves (defaults to the site's email transport). */
  send?: (m: EmailMessage) => Promise<unknown>;
};

/**
 * Send a fresh link for the gift `donationId`, asked with its expired credential `token`. Limits are counted before
 * anything is looked up (per internet address), and per gift only for the holder of that gift's expired link, so a
 * stranger who knows a donation reference can't use up the donor's own requests.
 */
export async function requestFreshConfirmationLink(args: { donationId: string; token: string | undefined; ip: string } & Deps): Promise<FreshLinkState> {
  const now = args.now ?? new Date();
  const limits = platformConfig.confirmationLink;
  if (await hitRateLimit("fresh-link-ip", ipKeys(args.ip), limits.freshPerAddress.tries, limits.freshPerAddress.minutes).catch((e) => (console.error(e), true))) {
    return { ok: false, message: FRESH_LINK_LIMITED };
  }
  if (!isUuid(args.donationId)) return { ok: true, message: FRESH_LINK_SENT };
  // Only the holder of this gift's own link, and only once it has expired (a working link needs nothing new).
  const access = await confirmationAccess(args.donationId, args.token, now).catch((e) => (console.error(e), "none" as const));
  if (access !== "expired") return { ok: true, message: FRESH_LINK_SENT };
  if (await hitRateLimit("fresh-link-gift", [`gift:${args.donationId}`], limits.freshPerGift.tries, limits.freshPerGift.minutes).catch((e) => (console.error(e), true))) {
    return { ok: false, message: FRESH_LINK_LIMITED };
  }

  const db = createAdminClient();
  type Saved = { token_hash: string; created_at: string };
  const kept: { previous: Saved | null } = { previous: null };
  try {
    const { data: gift, error } = await db
      .from("donations")
      .select("id, charities(name_en), donation_checkout_details(email)")
      .eq("id", args.donationId)
      .maybeSingle();
    if (error) throw error;
    type Row = { email: string | null };
    const details = gift?.donation_checkout_details as unknown as Row | Row[] | null | undefined;
    const email = (Array.isArray(details) ? details[0] : details)?.email?.trim();
    const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
    // No email on record (erased at the donor's request) or no site address: nothing to send, the same answer.
    if (!gift || !email || !site) return { ok: true, message: FRESH_LINK_SENT };
    const charity = gift.charities as unknown as { name_en: string } | null;
    // Kept so a failed send can put the old (expired) link back: the donor can then ask again with it.
    const { data: before, error: beforeError } = await db.from("donation_confirmations").select("token_hash, created_at").eq("donation_id", args.donationId).maybeSingle();
    if (beforeError) throw beforeError;
    kept.previous = before as Saved | null;
    // The old link has expired already, so replacing it takes nothing away from the donor.
    const token = await reissueConfirmationToken(args.donationId, now);
    const link = `${site}/donate/return?reference=${encodeURIComponent(args.donationId)}&t=${token}`;
    const send = args.send ?? ((m: EmailMessage) => getEmailTransport().send({ ...m, signal: AbortSignal.timeout(8_000) }));
    await send(freshLinkEmail(email, link, charity?.name_en ?? null));
  } catch (e) {
    console.error("[fresh-link] could not send a fresh link", e);
    // Nothing left: the old link goes back, so "Email me a fresh link" still works from it. An email that may have
    // left keeps its new link (putting the old one back would break the one in the inbox).
    if (kept.previous && !(e instanceof EmailMaybeSent)) {
      const { error: restoreError } = await db.from("donation_confirmations").upsert({ donation_id: args.donationId, ...kept.previous }, { onConflict: "donation_id" });
      if (restoreError) console.error("[fresh-link] could not put the old link back", restoreError);
    }
    // Only the holder of this gift's own link gets here, so saying it failed tells them nothing new.
    if (e instanceof EmailMaybeSent) {
      return { ok: false, message: "The email may not have gone. Check your inbox in a few minutes. If nothing arrives, sign in with the email you gave with to see this donation in your account." };
    }
    return { ok: false, message: "We couldn't send the email just now. Nothing has changed. Please try again in a few minutes." };
  }
  return { ok: true, message: FRESH_LINK_SENT };
}
