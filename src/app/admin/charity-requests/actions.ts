"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { notifyJoined } from "@/lib/charity-requests-notify";
import type { FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validKey = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= 120;
const done = () => revalidatePath("/admin/charity-requests");

/** We've asked the charity to join (or "Mark as new" again: the undo). Open requests only. */
export async function setInvited(nameKey: string, invited: boolean): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!validKey(nameKey)) return { ok: false, message: "That request wasn't found. Nothing was changed." };
  const { data, error } = await createAdminClient()
    .from("charity_requests")
    .update({ status: invited ? "invited" : "new" })
    .eq("name_key", nameKey)
    .eq("status", invited ? "new" : "invited")
    .select("id");
  if (error) return { ok: false, message: "We couldn't save that. Nothing was changed. Please try again." };
  await logAudit({ actorUserId: admin.userId, action: invited ? "charity_request.invited" : "charity_request.reopened", entityType: "charity_request", entityId: null, details: { name_key: nameKey, count: data?.length ?? 0 } });
  done();
  return { ok: true, message: invited ? "Marked as invited." : "Marked as new again." };
}

/**
 * The charity joined: link the requests to it, then email everyone who ticked the box and delete their addresses.
 * Can't be taken back (the emails go), so the page asks first.
 */
export async function markJoined(nameKey: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const charityId = formData.get("charity_id");
  if (!validKey(nameKey)) return { ok: false, message: "That request wasn't found. Nothing was changed." };
  if (typeof charityId !== "string" || !UUID.test(charityId)) return { ok: false, message: "Choose the charity it became.", fieldErrors: { charity_id: "Choose the charity it became." } };
  const db = createAdminClient();
  const { data: charity } = await db.from("charities").select("id, status").eq("id", charityId).maybeSingle();
  if (charity?.status !== "approved") return { ok: false, message: "That charity isn't live yet. Nothing was changed or sent.", fieldErrors: { charity_id: "Choose a live charity." } };
  const { data, error } = await db
    .from("charity_requests")
    .update({ status: "joined", charity_id: charityId })
    .eq("name_key", nameKey)
    .in("status", ["new", "invited"])
    .select("id");
  if (error) return { ok: false, message: "We couldn't save that. Nothing was changed or sent. Please try again." };
  const sent = await notifyJoined(charityId).catch((e) => {
    console.error("[charity-request] could not send the joined emails", e);
    return null;
  });
  await logAudit({ actorUserId: admin.userId, action: "charity_request.joined", entityType: "charity", entityId: charityId, details: { name_key: nameKey, count: data?.length ?? 0, sent: sent?.sent ?? 0, failed: sent?.failed ?? null } });
  done();
  if (!sent) return { ok: false, message: "Marked as joined, but the emails couldn't be sent. Nothing was emailed. Use Try again below." };
  if (sent.skipped) return { ok: false, message: `Marked as joined. ${sent.sent ? `${sent.sent} emailed. ` : ""}${sent.skipped} ${sent.skipped === 1 ? "wasn't" : "weren't"} emailed: email isn't switched on here, or the address isn't on this site's allowed list. Their addresses are kept; use Try again.` };
  if (sent.failed) return { ok: false, message: `Marked as joined. ${sent.sent} emailed, ${sent.failed} not sent. Use Try again below.` };
  return { ok: true, message: sent.sent ? `Marked as joined. ${sent.sent} ${sent.sent === 1 ? "donor was" : "donors were"} emailed, and their addresses deleted.` : "Marked as joined. Nobody had asked for an email." };
}

/** Emails that didn't go when a charity was marked as joined. */
export async function retryJoined(charityId: string): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!UUID.test(charityId)) return { ok: false, message: "That charity wasn't found. Nothing was sent." };
  const sent = await notifyJoined(charityId).catch(() => null);
  await logAudit({ actorUserId: admin.userId, action: "charity_request.retried", entityType: "charity", entityId: charityId, details: { sent: sent?.sent ?? 0, failed: sent?.failed ?? null, skipped: sent?.skipped ?? null } });
  done();
  if (!sent) return { ok: false, message: "We couldn't send them. Nothing was emailed. Please try again later." };
  if (sent.skipped) return { ok: false, message: `${sent.sent ? `${sent.sent} emailed. ` : ""}${sent.skipped} still not emailed: email isn't switched on here, or the address isn't on this site's allowed list.` };
  return sent.failed ? { ok: false, message: `${sent.sent} emailed, ${sent.failed} still not sent.` } : { ok: true, message: `${sent.sent} emailed.` };
}

/** We won't add this charity: close the requests and delete every email address left on them. Can't be taken back. */
export async function decline(nameKey: string): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!validKey(nameKey)) return { ok: false, message: "That request wasn't found. Nothing was changed." };
  const { data, error } = await createAdminClient()
    .from("charity_requests")
    .update({ status: "declined", notify_email: null })
    .eq("name_key", nameKey)
    .in("status", ["new", "invited"])
    .select("id");
  if (error) return { ok: false, message: "We couldn't save that. Nothing was changed. Please try again." };
  await logAudit({ actorUserId: admin.userId, action: "charity_request.declined", entityType: "charity_request", entityId: null, details: { name_key: nameKey, count: data?.length ?? 0 } });
  done();
  return { ok: true, message: "Closed. Any email addresses on these requests were deleted." };
}
