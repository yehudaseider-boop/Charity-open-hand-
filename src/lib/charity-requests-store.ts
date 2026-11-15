import "server-only";
import { charityRequestsOpen } from "@/config/app-links";
import {
  CHARITY_REQUEST_CONSENT,
  CHARITY_REQUEST_LIMITS,
  CHARITY_REQUEST_MESSAGES,
  checkCharityRequest,
  isBot,
  requestKey,
  requestSentMessage,
} from "@/lib/charity-requests";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/** The table isn't on this database yet (the migration waits for Yehuda's yes). */
export const notSetUp = (code: string | undefined) => code === "PGRST205" || code === "42P01";

export type RequestAnswer =
  | { ok: true; message: string; /** Already on Givezy: where to find it. */ existing?: { name: string; slug: string } }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; status: number };

/**
 * One "Request a charity", from the website or the app. A bot that fills the hidden field is told "sent" and nothing
 * is saved. If the charity is already on Givezy under that name, nothing is saved and the person is pointed to it.
 */
export async function saveCharityRequest(
  raw: { name?: unknown; town?: unknown; link?: unknown; note?: unknown; emailMe?: unknown; email?: unknown; website?: unknown },
  ctx: { cameFrom: "website" | "app"; userId: string | null; ip: string },
): Promise<RequestAnswer> {
  if (!charityRequestsOpen()) return { ok: false, message: CHARITY_REQUEST_MESSAGES.closed, status: 404 };
  const checked = checkCharityRequest(raw);
  if (isBot(raw.website)) return { ok: true, message: requestSentMessage(checked.ok ? checked.request.name : "them", false) };
  if (!checked.ok) return { ok: false, message: checked.message, fieldErrors: checked.fieldErrors, status: 422 };
  const r = checked.request;
  try {
    const limit = CHARITY_REQUEST_LIMITS.perHour;
    if (await hitRateLimit("charity-request", ipKeys(ctx.ip), limit.tries, limit.minutes)) {
      return { ok: false, message: CHARITY_REQUEST_MESSAGES.tooMany, status: 429 };
    }
    const db = createAdminClient();
    // Already listed under that name (searches can miss a name typed differently): send them to it instead.
    const { data: listed } = await db.from("charities").select("name_en, slug").eq("status", "approved").ilike("name_en", r.name.replace(/[%_\\]/g, "\\$&")).limit(1).maybeSingle();
    if (listed?.slug) {
      return { ok: true, message: `${listed.name_en} is already on Givezy. Nothing was sent.`, existing: { name: listed.name_en as string, slug: listed.slug as string } };
    }
    const { error } = await db.from("charity_requests").insert({
      name: r.name,
      name_key: requestKey(r.name) || r.name.toLowerCase().slice(0, 120),
      town: r.town,
      link: r.link,
      note: r.note,
      notify_email: r.notifyEmail,
      consent_version: r.notifyEmail ? CHARITY_REQUEST_CONSENT.version : null,
      requested_by: ctx.userId,
      came_from: ctx.cameFrom,
    });
    if (error) {
      if (notSetUp(error.code)) return { ok: false, message: CHARITY_REQUEST_MESSAGES.closed, status: 404 };
      throw error;
    }
  } catch (e) {
    console.error("[charity-request] not saved", e);
    return { ok: false, message: CHARITY_REQUEST_MESSAGES.failed, status: 503 };
  }
  return { ok: true, message: requestSentMessage(r.name, Boolean(r.notifyEmail)) };
}
