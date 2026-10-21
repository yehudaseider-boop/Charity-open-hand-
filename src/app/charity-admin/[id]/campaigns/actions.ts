"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { campaignSlug, checkCampaign } from "@/lib/charity/campaigns";
import { recordAction } from "@/lib/charity/charity-actions";
import { saDate } from "@/lib/charity/dashboard";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formToObject, type FormState } from "@/lib/form";
import { isUuid } from "@/lib/ids";
import { createClient } from "@/lib/supabase/server";

export async function startCampaign(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const checked = checkCampaign(formToObject(formData), saDate(new Date()));
  if (!checked.ok) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: checked.fieldErrors };
  const v = checked.value;
  const supabase = await createClient();
  const { data: made, error } = await supabase.from("campaigns").insert({
    charity_id: charityId,
    slug: campaignSlug(v.title, randomUUID()),
    title: v.title,
    description: v.description,
    target_cents: v.targetCents,
    ends_at: v.endsAt,
    status: "active",
  }).select("id").single();
  if (error) {
    if (/up to 3 campaigns/.test(error.message)) return { ok: false, message: "You can run up to 3 campaigns at a time. End one first." };
    console.error(error);
    return { ok: false, message: "We couldn't start that campaign. Please try again." };
  }
  await logAudit({ actorUserId: viewer.userId, action: "charity.campaign_started", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "campaign_started", { title: v.title }, { type: "delete", table: "campaigns", id: made.id as string });
  revalidatePath(`/charity-admin/${charityId}/campaigns`);
  revalidatePath(`/c/${charity.slug}`);
  redirect(`/charity-admin/${charityId}/campaigns?done=${done}`);
}

export async function endCampaign(charityId: string, campaignId: string): Promise<void> {
  const viewer = await requireViewer();
  if (!isUuid(campaignId)) return;
  const { charity } = await loadCharityForManager(charityId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").update({ status: "ended" }).eq("id", campaignId).eq("charity_id", charityId).eq("status", "active").select("id, title");
  if (error) throw error;
  if (!data?.length) return;
  await logAudit({ actorUserId: viewer.userId, action: "charity.campaign_ended", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "campaign_ended", { title: data[0].title as string }, { type: "reopen_campaign", id: campaignId });
  revalidatePath(`/charity-admin/${charityId}/campaigns`);
  revalidatePath(`/c/${charity.slug}`);
  redirect(`/charity-admin/${charityId}/campaigns?done=${done}`);
}
