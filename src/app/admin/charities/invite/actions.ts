"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import { inviteEmail, notifyCharity } from "@/lib/charity/emails";
import { createInvite } from "@/lib/charity/invites";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";

const inviteSchema = z.object({
  charity_name: z.string({ error: "Enter the charity's name" }).trim().min(2, "Enter the charity's name").max(120),
  contact_email: z.email("Enter a valid email address"),
});

export async function inviteCharity(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  const parsed = inviteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  if (await hitRateLimit("charity-invite", [`user:${admin.userId}`], 50, 24 * 60)) {
    return { ok: false, message: "That's a lot of invitations for one day. Please carry on tomorrow." };
  }
  const token = await createInvite(parsed.data.charity_name, parsed.data.contact_email, admin.userId);
  const link = `${(process.env.SITE_URL ?? "").replace(/\/+$/, "")}/apply?invite=${token}`;
  await notifyCharity(inviteEmail(parsed.data.contact_email, parsed.data.charity_name, link));
  await logAudit({ actorUserId: admin.userId, action: "charity.invited", entityType: "charity_invite", entityId: null, details: { charity_name: parsed.data.charity_name } });
  revalidatePath("/admin/charities");
  return { ok: true, message: `Invitation sent to ${parsed.data.contact_email}.` };
}
