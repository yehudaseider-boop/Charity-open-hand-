"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { recordAction } from "@/lib/charity/charity-actions";
import { IMAGE_MIME, MAX_PHOTOS, MAX_UPLOAD_BYTES, photoSchema, updateSchema } from "@/lib/charity/validation";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/ids";
import { isRealImage } from "@/lib/charity/file-check";
import { hitRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { cleanImage } from "@/lib/charity/clean-image";

function revalidate(charityId: string, slug: string) {
  revalidatePath(`/charity-admin/${charityId}/updates`);
  revalidatePath(`/c/${slug}`);
}

/** Checks an optional image and uploads it to the charity's own folder. Returns its path, nothing, or an error. */
async function uploadIfAny(charityId: string, folder: "photos" | "updates", formData: FormData, required: boolean) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return required ? { error: { ok: false, fieldErrors: { file: "Choose a photo" } } as FormState } : { path: null };
  if (file.size > MAX_UPLOAD_BYTES) return { error: { ok: false, fieldErrors: { file: "Photos must be 4 MB or smaller" } } as FormState };
  if (!(IMAGE_MIME as readonly string[]).includes(file.type) || !(await isRealImage(file))) {
    return { error: { ok: false, fieldErrors: { file: "Upload a JPG, PNG or WebP photo" } } as FormState };
  }
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `${charityId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("charity-public").upload(path, await cleanImage(file), { contentType: file.type }); // re-encoded: no GPS or other hidden details
  if (up.error) {
    console.error(up.error);
    return { error: { ok: false, message: "The upload didn't work. Please try again." } as FormState };
  }
  return { path };
}

/** Only ever this charity's own files (the database also refuses any other path). */
async function removeFile(charityId: string, path: string | null) {
  if (path && path.startsWith(`${charityId}/`) && !path.includes("..")) {
    await createAdminClient().storage.from("charity-public").remove([path]);
  }
}

export async function postUpdate(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const parsed = updateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  if (await hitRateLimit("charity-update", [`charity:${charityId}`], 20, 24 * 60)) {
    return { ok: false, message: "That's a lot of updates for one day. Please post again tomorrow." };
  }
  const photo = await uploadIfAny(charityId, "updates", formData, false);
  if ("error" in photo) return photo.error!;

  const supabase = await createClient();
  const { data: made, error } = await supabase.from("charity_updates").insert({ charity_id: charityId, body_en: parsed.data.body_en, photo_path: photo.path }).select("id").single();
  if (error) {
    await removeFile(charityId, photo.path);
    return { ok: false, message: "We couldn't post that. Please try again." };
  }
  await logAudit({ actorUserId: viewer.userId, action: "charity.update_posted", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "update_posted", {}, {
    type: "delete", table: "charity_updates", id: made.id as string, file: photo.path ? { bucket: "charity-public", path: photo.path } : null,
  });
  revalidate(charityId, charity.slug);
  redirect(`/charity-admin/${charityId}/updates?done=${done}`);
}

export async function removeUpdate(charityId: string, updateId: string): Promise<void> {
  const viewer = await requireViewer();
  if (!isUuid(updateId)) return;
  const { charity } = await loadCharityForManager(charityId);
  // The whole row, so "Undo" can put it back exactly; its photo file is kept for the same reason.
  const { data: row, error: readError } = await createAdminClient().from("charity_updates").select("*").eq("id", updateId).eq("charity_id", charityId).maybeSingle();
  if (readError) throw readError;
  if (!row) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_updates").delete().eq("id", updateId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  if (!data?.length) return;
  await logAudit({ actorUserId: viewer.userId, action: "charity.update_removed", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "update_removed", {}, { type: "reinsert", table: "charity_updates", row });
  revalidate(charityId, charity.slug);
  redirect(`/charity-admin/${charityId}/updates?done=${done}`);
}

export async function addPhoto(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const parsed = photoSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase.from("charity_photos").select("id", { count: "exact", head: true }).eq("charity_id", charityId);
  if ((count ?? 0) >= MAX_PHOTOS) return { ok: false, message: `You can have up to ${MAX_PHOTOS} photos. Remove one first.` };

  const photo = await uploadIfAny(charityId, "photos", formData, true);
  if ("error" in photo) return photo.error!;
  const { data: made, error } = await supabase.from("charity_photos").insert({ charity_id: charityId, storage_path: photo.path!, caption_en: parsed.data.caption_en ?? null }).select("id").single();
  if (error) {
    await removeFile(charityId, photo.path);
    return { ok: false, message: /up to 12/.test(error.message) ? `You can have up to ${MAX_PHOTOS} photos. Remove one first.` : "We couldn't add that photo. Please try again." };
  }
  await logAudit({ actorUserId: viewer.userId, action: "charity.photo_added", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "photo_added", {}, {
    type: "delete", table: "charity_photos", id: made.id as string, file: { bucket: "charity-public", path: photo.path! },
  });
  revalidate(charityId, charity.slug);
  redirect(`/charity-admin/${charityId}/updates?done=${done}`);
}

export async function removePhoto(charityId: string, photoId: string): Promise<void> {
  const viewer = await requireViewer();
  if (!isUuid(photoId)) return;
  const { charity } = await loadCharityForManager(charityId);
  // The whole row, so "Undo" can put it back exactly; the file is kept for the same reason.
  const { data: row, error: readError } = await createAdminClient().from("charity_photos").select("*").eq("id", photoId).eq("charity_id", charityId).maybeSingle();
  if (readError) throw readError;
  if (!row) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_photos").delete().eq("id", photoId).eq("charity_id", charityId).select("id");
  if (error) throw error;
  if (!data?.length) return;
  await logAudit({ actorUserId: viewer.userId, action: "charity.photo_removed", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "photo_removed", {}, { type: "reinsert", table: "charity_photos", row });
  revalidate(charityId, charity.slug);
  redirect(`/charity-admin/${charityId}/updates?done=${done}`);
}
