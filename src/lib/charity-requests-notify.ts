import "server-only";
import { EmailMaybeSent, getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailKeptSince, joinedEmail } from "@/lib/charity-requests";

/** `skipped`: email isn't switched on here, or the address isn't on the test site's allowed list. Nothing went. */
export type NotifySummary = { sent: number; failed: number; skipped: number };

/** A claim older than this was cut off mid-way (the server stopped between claiming and finishing). */
const STALE_CLAIM_MINUTES = 15;

/**
 * Email everyone who asked for a charity (and ticked the box) that it has joined, then delete their address.
 * One email per address, however many requests carry it (asked twice, or under two spellings). The address's
 * requests are claimed first (notified_at), so two runs at once never email anyone twice. A send that surely didn't
 * go is released for "Try again"; one that may have gone is counted as sent and never repeated. Never throws per
 * person.
 */
export async function notifyJoined(charityId: string): Promise<NotifySummary> {
  const db = createAdminClient();
  const out: NotifySummary = { sent: 0, failed: 0, skipped: 0 };
  await clearStaleClaims();
  const { data: charity, error: cErr } = await db.from("charities").select("name_en, slug, status").eq("id", charityId).maybeSingle();
  if (cErr) throw cErr;
  if (!charity || charity.status !== "approved") return out;
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const { subject, text } = joinedEmail(charity.name_en as string, `${site}/c/${charity.slug as string}`);

  const { data: rows, error } = await db
    .from("charity_requests")
    .select("id, notify_email")
    .eq("charity_id", charityId)
    .eq("status", "joined")
    .not("notify_email", "is", null)
    .is("notified_at", null)
    .limit(1000);
  if (error) throw error;
  const byAddress = new Map<string, string[]>();
  for (const r of rows ?? []) {
    const address = String(r.notify_email).trim().toLowerCase();
    byAddress.set(address, [...(byAddress.get(address) ?? []), r.id as string]);
  }
  const transport = getEmailTransport();
  for (const [address, ids] of byAddress) {
    const claim = await db.from("charity_requests").update({ notified_at: new Date().toISOString() }).in("id", ids).is("notified_at", null).select("id");
    if (claim.error || !claim.data?.length) continue;
    const claimed = claim.data.map((c) => c.id as string);
    try {
      const outcome = await transport.send({ to: address, subject, text });
      if (outcome !== "sent") {
        // Nothing went (review 16/11/2026: this was counted as sent and the address deleted, so the donor could never
        // be told). The address is kept for Try again.
        out.skipped += 1;
        await db.from("charity_requests").update({ notified_at: null }).in("id", claimed);
        continue;
      }
      out.sent += 1;
    } catch (e) {
      if (!(e instanceof EmailMaybeSent)) {
        out.failed += 1;
        console.error("[charity-request] the joined email was not sent", e);
        await db.from("charity_requests").update({ notified_at: null }).in("id", claimed);
        continue;
      }
      // It may have gone: never send it again.
      out.sent += 1;
      console.error("[charity-request] the joined email may or may not have gone; not sending again", e);
    }
    const { error: clearErr } = await db.from("charity_requests").update({ notify_email: null }).in("id", claimed);
    // Left for clearStaleClaims to finish.
    if (clearErr) console.error("[charity-request] could not delete an address after its email", clearErr.message);
  }
  return out;
}

/**
 * Addresses whose email was claimed but never finished (the server stopped, or deleting the address failed) are
 * deleted, never kept: the email may have gone, so it is not sent again. Run before each send and by the daily job.
 * Never throws; a missing table (the migration not yet run) is fine.
 */
export async function clearStaleClaims(now = new Date()): Promise<void> {
  try {
    const before = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
    const { error } = await createAdminClient().from("charity_requests").update({ notify_email: null }).not("notify_email", "is", null).lt("notified_at", before);
    if (error && error.code !== "PGRST205" && error.code !== "42P01") console.error("[charity-request] could not clear unfinished claims", error.message);
  } catch (e) {
    console.error("[charity-request] could not clear unfinished claims", e);
  }
}

/**
 * An email that waited a month on a charity that hasn't joined is deleted unused (Yehuda, 15/11/2026), as the tick
 * line promises. The request stays, without it. Run by the daily job. Never throws; a missing table is fine.
 */
export async function clearExpiredEmails(now = new Date()): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("charity_requests")
      .update({ notify_email: null })
      .not("notify_email", "is", null)
      .is("notified_at", null)
      .lt("created_at", emailKeptSince(now).toISOString());
    if (error && error.code !== "PGRST205" && error.code !== "42P01") console.error("[charity-request] could not delete month-old emails", error.message);
  } catch (e) {
    console.error("[charity-request] could not delete month-old emails", e);
  }
}
