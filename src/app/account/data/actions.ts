"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { legalConfig } from "@/config/legal";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { getEmailTransport } from "@/lib/email";
import type { FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  kind: z.enum(["delete", "correct", "object"], { error: "Choose what you'd like us to do" }),
  details: z.string().max(2000, "Please keep it under 2 000 characters").optional(),
});

/** A request to correct, delete or stop using the person's information (POPIA sections 11, 23 and 24). */
export async function sendDataRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer("/account/data");
  const parsed = schema.safeParse({ kind: formData.get("kind"), details: String(formData.get("details") ?? "").trim() || undefined });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };
  if (await hitRateLimit("data-request", [`user:${viewer.userId}`], 3, 24 * 60)) {
    return { ok: false, message: "You've sent several requests today. We'll respond to those first." };
  }

  const { error } = await createAdminClient()
    .from("data_requests")
    .insert({ user_id: viewer.userId, kind: parsed.data.kind, details: parsed.data.details ?? null });
  if (error) throw error;
  await logAudit({ actorUserId: viewer.userId, action: `privacy.request_${parsed.data.kind}`, entityType: "user", entityId: viewer.userId });

  // Let the Information Officer know, without personal details in the email.
  const to = legalConfig.informationOfficer.email ?? legalConfig.privacyEmail;
  if (to) {
    try {
      await getEmailTransport().send({
        to,
        subject: "New privacy request",
        text: `A new "${parsed.data.kind}" request is waiting in the admin area under Privacy requests.`,
      });
    } catch (e) {
      console.error("[privacy] could not notify the Information Officer", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath("/account/data");
  return { ok: true, message: "Thank you. We've received your request and will reply by email." };
}
