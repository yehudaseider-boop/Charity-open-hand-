"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { weekStart } from "@/lib/charity/thank-you";
import { createAdminClient } from "@/lib/supabase/admin";

const day = /^\d{4}-\d{2}-\d{2}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Choose (or change) the cause of the week for one week, this week or later. */
export async function setFeatured(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const week = String(formData.get("week") ?? "");
  const charityId = String(formData.get("charity_id") ?? "");
  if (!day.test(week) || week < weekStart(new Date()) || weekStart(new Date(`${week}T12:00:00+02:00`)) !== week) redirect("/admin/featured?error=week");
  if (!uuid.test(charityId)) redirect("/admin/featured?error=charity");
  const db = createAdminClient();
  const { data: charity } = await db.from("charities").select("id, name_en").eq("id", charityId).eq("status", "approved").maybeSingle();
  if (!charity) redirect("/admin/featured?error=charity");
  const { error } = await db.from("featured_charities").upsert({ week_start: week, charity_id: charity.id, created_by: admin.userId }, { onConflict: "week_start" });
  if (error) throw error;
  await logAudit({ actorUserId: admin.userId, action: "featured.set", entityType: "charity", entityId: charity.id, details: { week } });
  revalidatePath("/admin/featured");
  redirect(`/admin/featured?saved=${week}`);
}

/** No cause of the week for that week: the app then shows no card. */
export async function clearFeatured(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const week = String(formData.get("week") ?? "");
  if (!day.test(week)) redirect("/admin/featured?error=week");
  const { error } = await createAdminClient().from("featured_charities").delete().eq("week_start", week);
  if (error) throw error;
  await logAudit({ actorUserId: admin.userId, action: "featured.cleared", entityType: "platform", entityId: null, details: { week } });
  revalidatePath("/admin/featured");
  redirect(`/admin/featured?cleared=${week}`);
}
