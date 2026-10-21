"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAction } from "@/lib/charity/charity-actions";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { IMAGE_MIME, MAX_UPLOAD_BYTES, profileSchema } from "@/lib/charity/validation";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { isUuid } from "@/lib/ids";
import { isRealImage } from "@/lib/charity/file-check";
import { createClient } from "@/lib/supabase/server";
import { cleanImage } from "@/lib/charity/clean-image";
import { notifyCharity, publicChangeEmail } from "@/lib/charity/emails";
import { parseSuggestedAmounts } from "@/lib/charity/suggested-amounts";
import { platformConfig } from "@/config/platform";
import { formatRand } from "@/lib/money";

/** An approved charity is public with a "Verified" badge: tell us when its name or pictures change, so we can look. */
async function tellReviewer(charity: { id: string; status: string; name_en: string }, what: string) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (to && charity.status === "approved") await notifyCharity(publicChangeEmail(to, charity.name_en, charity.id, what));
}

function revalidate(charityId: string, slug: string) {
  revalidatePath(`/charity-admin/${charityId}/profile`);
  revalidatePath(`/c/${slug}`);
  revalidatePath("/charities");
}


function failed(error: unknown): FormState {
  console.error(error);
  return { ok: false, message: "That didn't save. Please try again." };
}

export async function saveProfile(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity, categoryIds: categoriesBefore } = await loadCharityForManager(charityId);
  const parsed = profileSchema.safeParse(formToObject(formData));
  const suggested = parseSuggestedAmounts(
    [1, 2, 3].map((n) => formData.get(`suggested_${n}`)?.toString()),
    platformConfig.minDonationCents,
    formatRand(platformConfig.minDonationCents),
  );
  // Every problem at once, so nobody fixes one lot and then meets another.
  if (!parsed.success || !suggested.ok) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { ...(parsed.success ? {} : zodErrors(parsed.error).fieldErrors), ...(suggested.ok ? {} : suggested.fieldErrors) },
    };
  }
  const v = parsed.data;
  const categoryIds = formData.getAll("category_ids").map(String).filter(isUuid);

  const supabase = await createClient();
  const after = {
    name_en: v.name_en,
    description_en: v.description_en ?? null,
    funds_use_en: v.funds_use_en ?? null,
    thank_you_en: v.thank_you_en ?? null,
    impact_en: v.impact_en ?? null,
    suggested_amounts_cents: suggested.cents,
    website: v.website ?? null,
  };
  const before = Object.fromEntries(Object.keys(after).map((k) => [k, (charity as unknown as Record<string, unknown>)[k] ?? null]));
  const { data, error } = await supabase.from("charities").update(after).eq("id", charityId).select("id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "You can't edit this charity." };

  // Categories: add the new ones first, then drop the rest, so a failure never
  // leaves the charity with none (RLS limits this to the charity's own rows).
  if (categoryIds.length) {
    const ins = await supabase
      .from("charity_categories")
      .upsert(categoryIds.map((category_id) => ({ charity_id: charityId, category_id })), { onConflict: "charity_id,category_id", ignoreDuplicates: true });
    if (ins.error) return failed(ins.error);
  }
  let del = supabase.from("charity_categories").delete().eq("charity_id", charityId);
  if (categoryIds.length) del = del.not("category_id", "in", `(${categoryIds.join(",")})`);
  const removed = await del;
  if (removed.error) return failed(removed.error);

  const renamed = v.name_en !== charity.name_en;
  await logAudit({
    actorUserId: viewer.userId,
    action: "charity.profile_updated",
    entityType: "charity",
    entityId: charityId,
    details: renamed ? { name_from: charity.name_en, name_to: v.name_en } : undefined,
  });
  if (renamed) await tellReviewer(charity, `its name, from "${charity.name_en}" to "${v.name_en}"`);
  const done = await recordAction(charityId, viewer.userId, "profile_saved", {}, { type: "restore", table: "charities", before, after, categories: categoriesBefore, categoriesAfter: categoryIds });
  revalidate(charityId, charity.slug);
  redirect(`/charity-admin/${charityId}/profile?done=${done}`);
}

export async function uploadImage(
  charityId: string,
  kind: "logo" | "cover",
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const viewer = await requireViewer();
  if (kind !== "logo" && kind !== "cover") return { ok: false, message: "Unknown image." };
  const { charity } = await loadCharityForManager(charityId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fieldErrors: { file: "Choose an image" } };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, fieldErrors: { file: "Images must be 5 MB or smaller" } };
  if (!(IMAGE_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, fieldErrors: { file: "Upload a JPG, PNG or WebP image" } };
  }
  if (!(await isRealImage(file))) return { ok: false, fieldErrors: { file: "That file isn't a JPG, PNG or WebP image" } };

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `${charityId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("charity-public").upload(path, await cleanImage(file), { contentType: file.type }); // re-encoded: no GPS or other hidden details
  if (up.error) return failed(up.error);

  const column = kind === "logo" ? "logo_path" : "cover_path";
  const { error } = await supabase.from("charities").update({ [column]: path }).eq("id", charityId);
  if (error) return failed(error);

  // The previous image file is kept, so "Undo" can put it back.
  const old = kind === "logo" ? charity.logo_path : charity.cover_path;
  await logAudit({ actorUserId: viewer.userId, action: `charity.${kind}_changed`, entityType: "charity", entityId: charityId });
  await tellReviewer(charity, kind === "logo" ? "its logo" : "its cover image");
  const done = await recordAction(charityId, viewer.userId, kind === "logo" ? "logo_changed" : "cover_changed", {}, {
    type: "restore", table: "charities", before: { [column]: old ?? null }, after: { [column]: path }, dropFile: { bucket: "charity-public", path },
  });
  revalidate(charityId, charity.slug);
  redirect(`/charity-admin/${charityId}/profile?done=${done}`);
}

/** Turn "a donation came in" emails on or off for this charity. */
export async function saveDonationEmails(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { priv } = await loadCharityForManager(charityId);
  const on = formData.get("notify_donations") === "on";
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_private").update({ notify_donations: on }).eq("charity_id", charityId).select("charity_id");
  if (error) return failed(error);
  if (!data?.length) return { ok: false, message: "You can't change this charity's settings." };
  await logAudit({ actorUserId: viewer.userId, action: on ? "charity.donation_emails_on" : "charity.donation_emails_off", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, on ? "donation_emails_on" : "donation_emails_off", {}, {
    type: "restore", table: "charity_private", before: { notify_donations: priv?.notify_donations !== false }, after: { notify_donations: on },
  });
  revalidatePath(`/charity-admin/${charityId}/profile`);
  redirect(`/charity-admin/${charityId}/profile?done=${done}`);
}
