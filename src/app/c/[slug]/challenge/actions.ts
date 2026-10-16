"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { platformConfig } from "@/config/platform";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { challengeSlug, checkChallenge } from "@/lib/challenges/rules";
import { saDate } from "@/lib/charity/dashboard";
import { challengeStartedEmail, notifyCharity } from "@/lib/charity/emails";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { formToObject, type FormState } from "@/lib/form";
import { formatRand } from "@/lib/money";
import { hitRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A signed-in donor starts a group challenge for an approved charity that takes donations. It goes
 * live at once; the charity is emailed and can stop it. Written by the server only.
 */
export async function startChallenge(charitySlug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer(`/c/${charitySlug}/challenge`);
  const charity = await loadDonatableCharity(charitySlug);
  if (!charity?.acceptingPayments) return { ok: false, message: "This charity can't take online donations right now, so a challenge can't start yet." };
  const checked = checkChallenge(formToObject(formData), saDate(new Date()), platformConfig.minDonationCents, formatRand(platformConfig.minDonationCents));
  if (!checked.ok) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: checked.fieldErrors };
  if (await hitRateLimit("challenge-start", [`user:${viewer.userId}`], 5, 60)) {
    return { ok: false, message: "You've started a few challenges already. Please try again in an hour." };
  }
  const v = checked.value;
  const slug = challengeSlug(v.title, randomUUID());
  const db = createAdminClient();
  const { error } = await db.from("group_challenges").insert({
    slug,
    charity_id: charity.id,
    started_by: viewer.userId,
    starter_name: v.starterName,
    title: v.title,
    reason: v.reason,
    target_cents: v.targetCents,
    ends_at: v.endsAt,
  });
  if (error) {
    if (/up to 5 challenges/.test(error.message)) return { ok: false, message: "You can run up to 5 challenges at a time." };
    console.error(error);
    return { ok: false, message: "We couldn't start your challenge. Please try again." };
  }
  await logAudit({ actorUserId: viewer.userId, action: "challenge.started", entityType: "charity", entityId: charity.id, details: { slug } });
  const { data: priv } = await db.from("charity_private").select("contact_email").eq("charity_id", charity.id).maybeSingle();
  if (priv?.contact_email) {
    await notifyCharity(challengeStartedEmail(priv.contact_email, { charityName: charity.name_en, charityId: charity.id, starterName: v.starterName, title: v.title, targetCents: v.targetCents, slug }));
  }
  revalidatePath(`/c/${charity.slug}`);
  redirect(`/g/${slug}?started=1`);
}
