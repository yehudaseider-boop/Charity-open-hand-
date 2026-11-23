"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { randomCode, slugify } from "@/lib/charity/slug";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";
import { claimInvite } from "@/lib/charity/invites";
import { isMissingFunction } from "@/lib/charity/keeping-donors-queries";
import { createAdminClient } from "@/lib/supabase/admin";

const startSchema = z.object({
  name_en: z.string({ error: "Enter your organisation's name" }).min(2, "Enter your organisation's name").max(120),
});

/** Create a draft application and make the applicant its owner. */
export async function startApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer("/apply");
  const parsed = startSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  if (await hitRateLimit("charity-apply", [`user:${viewer.userId}`], 3, 24 * 60)) {
    return { ok: false, message: "You've started several applications today. Please finish one, or try again tomorrow." };
  }

  const db = createAdminClient();
  const base = slugify(parsed.data.name_en);
  let charityId: string | null = null;

  // Slug and QuickGive code must be unique; retry with a suffix on a clash. The charity, its owner and its private row
  // are made in one step in the database, so a failure never leaves a charity with no owner (review 23/11/2026).
  for (let attempt = 0; attempt < 5 && !charityId; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomCode(4)}`;
    const args = { p_slug: slug, p_quickgive_code: randomCode(), p_name: parsed.data.name_en, p_user_id: viewer.userId, p_email: viewer.email };
    const { data, error } = await db.rpc("start_charity_application", args);
    if (data) charityId = data as string;
    // Until database change 20261123000009 is in, the three rows are made one by one, as before it.
    else if (isMissingFunction(error)) charityId = await startStepByStep(args);
    else if (error && error.code !== "23505") throw error;
  }
  if (!charityId) return { ok: false, message: "Could not create the application. Please try again." };

  // Started from an invitation: mark it used, so the link can't start a second application.
  const invite = formData.get("invite");
  const fromInvite = typeof invite === "string" && invite ? await claimInvite(invite, viewer.userId, charityId) : false;

  await logAudit({
    actorUserId: viewer.userId,
    action: "charity.application_started",
    entityType: "charity",
    entityId: charityId,
    details: fromInvite ? { from_invite: true } : undefined,
  });
  redirect(`/charity-admin/${charityId}/application`);
}

/**
 * Before database change 20261123000009 (`start_charity_application`): the charity, its owner and its private row are
 * made one after another. If the second or third fails, the charity row is removed again, so no application is left with
 * no owner. Null on a name or code clash (the caller tries another).
 */
async function startStepByStep(a: { p_slug: string; p_quickgive_code: string; p_name: string; p_user_id: string; p_email: string }): Promise<string | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("charities")
    .insert({ slug: a.p_slug, quickgive_code: a.p_quickgive_code, name_en: a.p_name, legal_name_en: a.p_name, status: "draft" })
    .select("id")
    .single();
  if (error?.code === "23505") return null;
  if (error) throw error;
  const id = data.id as string;
  const links = await Promise.all([
    db.from("charity_admins").insert({ charity_id: id, user_id: a.p_user_id, role: "owner" }),
    db.from("charity_private").insert({ charity_id: id, contact_email: a.p_email }),
  ]);
  const failed = links.find((l) => l.error)?.error;
  if (failed) {
    await db.from("charity_admins").delete().eq("charity_id", id);
    await db.from("charity_private").delete().eq("charity_id", id);
    await db.from("charities").delete().eq("id", id);
    throw failed;
  }
  return id;
}
