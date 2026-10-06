"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { IMAGE_MIME, MAX_UPLOAD_BYTES, profileSchema } from "@/lib/charity/validation";
import { formToObject, zodErrors, type FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function revalidate(charityId: string, slug: string) {
  revalidatePath(`/charity-admin/${charityId}/profile`);
  revalidatePath(`/c/${slug}`);
  revalidatePath("/charities");
}

export async function saveProfile(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const parsed = profileSchema.safeParse(formToObject(formData));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  const categoryIds = formData.getAll("category_ids").map(String);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charities")
    .update({
      name_en: v.name_en,
      name_he: v.name_he ?? null,
      description_en: v.description_en ?? null,
      description_he: v.description_he ?? null,
      website: v.website ?? null,
    })
    .eq("id", charityId)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "You can't edit this charity." };

  // Replace categories (RLS limits this to the charity's own rows).
  const del = await supabase.from("charity_categories").delete().eq("charity_id", charityId);
  if (del.error) return { ok: false, message: del.error.message };
  if (categoryIds.length) {
    const ins = await supabase
      .from("charity_categories")
      .insert(categoryIds.map((category_id) => ({ charity_id: charityId, category_id })));
    if (ins.error) return { ok: false, message: ins.error.message };
  }

  await logAudit({ actorUserId: viewer.userId, action: "charity.profile_updated", entityType: "charity", entityId: charityId });
  revalidate(charityId, charity.slug);
  return { ok: true, message: "Profile saved." };
}

export async function uploadImage(
  charityId: string,
  kind: "logo" | "cover",
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fieldErrors: { file: "Choose an image" } };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, fieldErrors: { file: "Images must be 5 MB or smaller" } };
  if (!(IMAGE_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, fieldErrors: { file: "Upload a JPG, PNG or WebP image" } };
  }

  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `${charityId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const up = await supabase.storage.from("charity-public").upload(path, file, { contentType: file.type });
  if (up.error) return { ok: false, message: `Upload failed: ${up.error.message}` };

  const column = kind === "logo" ? "logo_path" : "cover_path";
  const { error } = await supabase.from("charities").update({ [column]: path }).eq("id", charityId);
  if (error) return { ok: false, message: error.message };

  const old = kind === "logo" ? charity.logo_path : charity.cover_path;
  if (old) await createAdminClient().storage.from("charity-public").remove([old]);
  revalidate(charityId, charity.slug);
  return { ok: true, message: kind === "logo" ? "Logo updated." : "Cover image updated." };
}
