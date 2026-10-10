"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
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
