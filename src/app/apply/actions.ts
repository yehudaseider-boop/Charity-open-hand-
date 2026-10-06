"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { randomCode, slugify } from "@/lib/charity/slug";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";

const startSchema = z.object({
  name_en: z.string({ error: "Enter your organisation's name" }).min(2, "Enter your organisation's name").max(120),
});

/** Create a draft application and make the applicant its owner. */
export async function startApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer("/apply");
  const parsed = startSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);

  const db = createAdminClient();
  const base = slugify(parsed.data.name_en);
  let charityId: string | null = null;

  // Slug and QuickGive code must be unique; retry with a suffix on a clash.
  for (let attempt = 0; attempt < 5 && !charityId; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomCode(4)}`;
    const { data, error } = await db
      .from("charities")
      .insert({
        slug,
        quickgive_code: randomCode(),
        name_en: parsed.data.name_en,
        legal_name_en: parsed.data.name_en,
        status: "draft",
      })
      .select("id")
      .single();
    if (data) charityId = data.id;
    else if (error && error.code !== "23505") throw error;
  }
  if (!charityId) return { ok: false, message: "Could not create the application. Please try again." };

  const links = await Promise.all([
    db.from("charity_admins").insert({ charity_id: charityId, user_id: viewer.userId, role: "owner" }),
    db.from("charity_private").insert({ charity_id: charityId, contact_email: viewer.email }),
  ]);
  for (const { error } of links) if (error) throw error;

  await logAudit({
    actorUserId: viewer.userId,
    action: "charity.application_started",
    entityType: "charity",
    entityId: charityId,
  });
  redirect(`/charity-admin/${charityId}/application`);
}
