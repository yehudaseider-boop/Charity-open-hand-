"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const allowed = new Set(["paused", "active", "cancelled"]);

/** Pause, resume or cancel one of the signed-in donor's own monthly donations (the database checks it is theirs). */
export async function changeMonthly(formData: FormData) {
  await requireViewer("/account");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !allowed.has(status)) redirect("/account?monthly=error");
  const { error } = await (await createClient()).rpc("set_my_recurring_status", { p_id: id, p_status: status });
  if (error) redirect("/account?monthly=error");
  revalidatePath("/account");
  redirect("/account?monthly=done");
}
