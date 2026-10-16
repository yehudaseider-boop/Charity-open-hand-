"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { campaignSlug, checkCampaign } from "@/lib/charity/campaigns";
import { saDate } from "@/lib/charity/dashboard";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formToObject, type FormState } from "@/lib/form";
import { isUuid } from "@/lib/ids";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { challengeStoppedEmail } from "@/lib/challenges/emails";
import { getEmailTransport } from "@/lib/email";

export async function startCampaign(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const checked = checkCampaign(formToObject(formData), saDate(new Date()));
  if (!checked.ok) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: checked.fieldErrors };
  const v = checked.value;
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").insert({
    charity_id: charityId,
    slug: campaignSlug(v.title, randomUUID()),
    title: v.title,
    description: v.description,
    target_cents: v.targetCents,
    ends_at: v.endsAt,
    status: "active",
  });
  if (error) {
    if (/up to 3 campaigns/.test(error.message)) return { ok: false, message: "You can run up to 3 campaigns at a time. End one first." };
    console.error(error);
    return { ok: false, message: "We couldn't start that campaign. Please try again." };
  }
  await logAudit({ actorUserId: viewer.userId, action: "charity.campaign_started", entityType: "charity", entityId: charityId });
  revalidatePath(`/charity-admin/${charityId}/campaigns`);
  revalidatePath(`/c/${charity.slug}`);
  return { ok: true, message: charity.status === "approved" ? "Your campaign is live. Donors can give to it now." : "Saved. Donors see it once your application is approved." };
}

export async function endCampaign(charityId: string, campaignId: string): Promise<void> {
  const viewer = await requireViewer();
  if (!isUuid(campaignId)) return;
  const { charity } = await loadCharityForManager(charityId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").update({ status: "ended" }).eq("id", campaignId).eq("charity_id", charityId).eq("status", "active").select("id");
  if (error) throw error;
  if (!data?.length) return;
  await logAudit({ actorUserId: viewer.userId, action: "charity.campaign_ended", entityType: "charity", entityId: charityId });
  revalidatePath(`/charity-admin/${charityId}/campaigns`);
  revalidatePath(`/c/${charity.slug}`);
}

/**
 * Stop a group challenge a supporter started for this charity. Gifts already made stay with the charity.
 * The person who started it is told by email (the charity never sees their email address).
 */
export async function stopChallenge(charityId: string, challengeId: string): Promise<void> {
  const viewer = await requireViewer();
  if (!isUuid(challengeId)) return;
  const { charity } = await loadCharityForManager(charityId);
  const db = createAdminClient();
  const { data, error } = await db
    .from("group_challenges")
    .update({ status: "stopped", stopped_at: new Date().toISOString() })
    .eq("id", challengeId)
    .eq("charity_id", charityId)
    .eq("status", "active")
    .select("slug, title, started_by");
  if (error) throw error;
  const row = data?.[0];
  if (!row) return;
  await logAudit({ actorUserId: viewer.userId, action: "charity.challenge_stopped", entityType: "charity", entityId: charityId, details: { slug: row.slug } });
  if (row.started_by) {
    const { data: who } = await db.from("profiles").select("email").eq("id", row.started_by).maybeSingle();
    if (who?.email) {
      try {
        await getEmailTransport().send(challengeStoppedEmail(who.email, { charityName: charity.name_en, charitySlug: charity.slug, title: row.title }));
      } catch (e) {
        console.error("[challenge] stop email not sent", e);
      }
    }
  }
  revalidatePath(`/charity-admin/${charityId}/campaigns`);
  revalidatePath(`/c/${charity.slug}`);
  revalidatePath(`/g/${row.slug}`);
}
