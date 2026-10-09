"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { IMAGE_MIME, MAX_PHOTOS, MAX_UPLOAD_BYTES, photoSchema, updateSchema } from "@/lib/charity/validation";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function revalidate(charityId: string, slug: string) {
  revalidatePath(`/charity-admin/${charityId}/updates`);
  revalidatePath(`/c/${slug}`);
}

/** Checks an optional image and uploads it to the charity's own folder. Returns its path, nothing, or an error. */
async function uploadIfAny(charityId: string, folder: "photos" | "updates", formData: FormData, required: boolean) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return required ? { error: { ok: false, fieldErrors: { file: "Choose a photo" } } as FormState } : { path: null };
  if (file.size > MAX_UPLOAD_BYTES) return { error: { ok: false, fieldErrors: { file: "Photos must be 5 MB or smaller" } } as FormState };
  if (!(IMAGE_MIME as readonly string[]).includes(file.type)) return { error: { ok: false, fieldErrors: { file: "Upload a JPG, PNG or WebP photo" } } as FormState };
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `${charityId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("charity-public").upload(path, file, { contentType: file.type });
  if (up.error) return { error: { ok: false, message: `Upload failed: ${up.error.message}` } as FormState };
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
  const photo = await uploadIfAny(charityId, "updates", formData, false);
  if ("error" in photo) return photo.error!;

  const supabase = await createClient();
  const { error } = await supabase.from("charity_updates").insert({ charity_id: charityId, body_en: parsed.data.body_en, photo_path: photo.path });
  if (error) {
    await removeFile(charityId, photo.path);
    return { ok: false, message: "We couldn't post that. Please try again." };
  }
  await logAudit({ actorUserId: viewer.userId, action: "charity.update_posted", entityType: "charity", entityId: charityId });
  revalidate(charityId, charity.slug);
  return { ok: true, message: "Posted." };
}

export async function removeUpdate(charityId: string, updateId: string): Promise<void> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_updates").delete().eq("id", updateId).eq("charity_id", charityId).select("photo_path");
  if (error) throw error;
  if (!data?.length) return;
  await removeFile(charityId, data[0].photo_path);
  await logAudit({ actorUserId: viewer.userId, action: "charity.update_removed", entityType: "charity", entityId: charityId });
  revalidate(charityId, charity.slug);
}

export async function addPhoto(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const parsed = photoSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const supabase = await createClient();
  const { count } = await supabase.from("charity_photos").select("id", { count: "exact", head: true }).eq("charity_id", charityId);
  if ((count ?? 0) >= MAX_PHOTOS) return { ok: false, message: `You can have up to ${MAX_PHOTOS} photos. Remove one first.` };

  const photo = await uploadIfAny(charityId, "photos", formData, true);
  if ("error" in photo) return photo.error!;
  const { error } = await supabase.from("charity_photos").insert({ charity_id: charityId, storage_path: photo.path!, caption_en: parsed.data.caption_en ?? null });
  if (error) {
    await removeFile(charityId, photo.path);
    return { ok: false, message: /up to 12/.test(error.message) ? `You can have up to ${MAX_PHOTOS} photos. Remove one first.` : "We couldn't add that photo. Please try again." };
  }
  revalidate(charityId, charity.slug);
  return { ok: true, message: "Photo added." };
}

export async function removePhoto(charityId: string, photoId: string): Promise<void> {
  await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_photos").delete().eq("id", photoId).eq("charity_id", charityId).select("storage_path");
  if (error) throw error;
  if (!data?.length) return;
  await removeFile(charityId, data[0].storage_path);
  revalidate(charityId, charity.slug);
}
