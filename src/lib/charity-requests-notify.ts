import "server-only";
import { EmailMaybeSent, getEmailTransport } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinedEmail } from "@/lib/charity-requests";

export type NotifySummary = { sent: number; failed: number };

/**
 * Email everyone who asked for a charity (and ticked the box) that it has joined, then delete their address. Each
 * request is claimed first (notified_at), so two runs at once never email anyone twice. A send that surely didn't go
 * is released for "Try again"; one that may have gone is counted as sent, never repeated. Never throws per person.
 */
export async function notifyJoined(charityId: string): Promise<NotifySummary> {
  const db = createAdminClient();
  const out: NotifySummary = { sent: 0, failed: 0 };
  const { data: charity, error: cErr } = await db.from("charities").select("name_en, slug, status").eq("id", charityId).maybeSingle();
  if (cErr) throw cErr;
  if (!charity || charity.status !== "approved") return out;
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const { subject, text } = joinedEmail(charity.name_en as string, `${site}/c/${charity.slug as string}`);

  const { data: rows, error } = await db
    .from("charity_requests")
    .select("id, notify_email")
    .eq("charity_id", charityId)
    .eq("status", "added")
    .not("notify_email", "is", null)
    .is("notified_at", null)
    .limit(500);
  if (error) throw error;
  const transport = getEmailTransport();
  for (const row of rows ?? []) {
    const claim = await db.from("charity_requests").update({ notified_at: new Date().toISOString() }).eq("id", row.id).is("notified_at", null).select("id");
    if (claim.error || !claim.data?.length) continue;
    try {
      await transport.send({ to: row.notify_email as string, subject, text });
      out.sent += 1;
    } catch (e) {
      if (e instanceof EmailMaybeSent) {
        // It may have gone: never send it again.
        out.sent += 1;
        console.error("[charity-request] the joined email may or may not have gone; not sending again", e);
      } else {
        out.failed += 1;
        console.error("[charity-request] the joined email was not sent", e);
        await db.from("charity_requests").update({ notified_at: null }).eq("id", row.id);
        continue;
      }
    }
    const { error: clearErr } = await db.from("charity_requests").update({ notify_email: null }).eq("id", row.id);
    if (clearErr) console.error("[charity-request] could not delete an address after its email", clearErr.message);
  }
  return out;
}
