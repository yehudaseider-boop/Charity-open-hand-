"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { ERASE_KEPT_TEXT, eraseDonor } from "@/lib/privacy/erase";
import { createAdminClient } from "@/lib/supabase/admin";

/** Close a privacy request with a short reply the person sees on their "Your information" page. */
export async function closeRequest(id: string, formData: FormData) {
  const admin = await requirePlatformAdmin();
  const status = formData.get("status") === "declined" ? "declined" : "done";
  const response = String(formData.get("response") ?? "").trim().slice(0, 2000) || null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { error } = await createAdminClient()
    .from("data_requests")
    .update({ status, response, closed_at: new Date().toISOString(), closed_by: admin.userId })
    .eq("id", id)
    .eq("status", "open");
  if (error) throw error;
  await logAudit({ actorUserId: admin.userId, action: `privacy.request_${status}`, entityType: "data_request", entityId: id });
  revalidatePath("/admin/requests");
}

/**
 * Carry out a person's request to delete their information, then close it. Only for a "delete"
 * request that is still open, and only after the admin ticks that they have checked who is asking.
 */
export async function eraseForRequest(id: string, formData: FormData) {
  const admin = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id) || formData.get("checked") !== "on") redirect("/admin/requests?erased=unchecked");
  const db = createAdminClient();
  const { data: request, error } = await db.from("data_requests").select("id, user_id, kind, status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!request || request.kind !== "delete" || request.status !== "open") redirect("/admin/requests?erased=notfound");

  const summary = await eraseDonor({ userId: request.user_id as string, actorUserId: admin.userId });
  // If their sign-in account is gone, the request went with it. Otherwise close it with what was done.
  await db
    .from("data_requests")
    .update({
      status: "done",
      response: `Your information has been erased. ${ERASE_KEPT_TEXT}${summary.note ? ` (${summary.note})` : ""}`,
      closed_at: new Date().toISOString(),
      closed_by: admin.userId,
    })
    .eq("id", id);
  revalidatePath("/admin/requests");
  redirect(`/admin/requests?erased=${summary.accountDeleted ? "full" : "kept"}&donors=${summary.donors}`);
}

const emailSchema = z.object({ email: z.email(), again: z.email() });

/** Erase a donor who never had an account, found by the email address they gave with. The admin types it twice. */
export async function eraseByEmail(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const parsed = emailSchema.safeParse({ email: String(formData.get("email") ?? "").trim(), again: String(formData.get("again") ?? "").trim() });
  if (!parsed.success || parsed.data.email.toLowerCase() !== parsed.data.again.toLowerCase() || formData.get("checked") !== "on") {
    redirect("/admin/requests?erased=check");
  }
  const summary = await eraseDonor({ email: parsed.data.email, actorUserId: admin.userId });
  revalidatePath("/admin/requests");
  redirect(`/admin/requests?erased=guest&donors=${summary.donors}`);
}
