"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Withdraw an issued receipt (a wrong address, a refunded donation, and so on).
 * The receipt is kept, marked void with the reason; it is never deleted. To
 * issue a replacement, run the yearly receipts job again: the donations are
 * free to go on a new receipt once the old one is void.
 */
export async function voidReceipt(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Receipt not found." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Give a reason for the record" } };

  const { data, error } = await createAdminClient()
    .from("s18a_receipts")
    .update({ status: "void", voided_at: new Date().toISOString(), void_reason: reason.slice(0, 2000) })
    .eq("id", id)
    .eq("status", "issued")
    .select("id, details");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Only an issued receipt can be withdrawn." };

  await logAudit({
    actorUserId: admin.userId,
    action: "receipt.voided",
    entityType: "s18a_receipt",
    entityId: id,
    details: { reason, reference: (data[0].details as { receipt_reference?: string }).receipt_reference },
  });
  revalidatePath("/admin/receipts");
  return { ok: true, message: "Withdrawn. Run the receipts job to issue a replacement." };
}
