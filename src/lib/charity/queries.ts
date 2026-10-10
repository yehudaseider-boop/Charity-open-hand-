import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { requireSecondStep } from "@/lib/mfa";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "./validation";

export const CHARITY_FIELDS =
  "id, slug, quickgive_code, name_en, name_he, legal_name_en, legal_name_he, description_en, description_he, funds_use_en, thank_you_en, website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city, postal_code, status, rejection_reason, is_verified, verified_at, is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path, gateway, gateway_subaccount_ref, approved_at, created_at, updated_at";

export const PRIVATE_FIELDS =
  "charity_id, contact_name, contact_email, contact_phone, bank_name, bank_account_holder, bank_account_last4, bank_branch_code, bank_verified_at";

export type CharityDocument = {
  id: string;
  document_type: DocumentType;
  file_name: string;
  storage_path: string;
  signed_on: string | null;
  uploaded_at: string;
};

/**
 * Everything about one charity, read as the signed-in person. Row-level
 * security decides access: a stranger gets "not found".
 */
export async function loadCharityForManager(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Admins prove their second step first: until then the database shows them nothing.
  const viewer = await getViewer();
  if (viewer && (viewer.isPlatformAdmin || viewer.managedCharityIds.includes(id))) {
    await requireSecondStep(`/charity-admin/${id}`);
  }
  const supabase = await createClient();
  // Confirm management rights before reading anything private.
  const [{ data: canManage }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_charity_admin", { target: id }),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!canManage && !isAdmin) notFound();

  const [charity, priv, docs, cats] = await Promise.all([
    // Gateway and mandate fields are closed to every client, so the server reads
    // the charity row itself, now that it knows this person manages it.
    createAdminClient().from("charities").select(CHARITY_FIELDS).eq("id", id).maybeSingle(),
    supabase.from("charity_private").select(PRIVATE_FIELDS).eq("charity_id", id).maybeSingle(),
    supabase
      .from("charity_documents")
      .select("id, document_type, file_name, storage_path, signed_on, uploaded_at")
      .eq("charity_id", id)
      .order("uploaded_at"),
    supabase.from("charity_categories").select("category_id").eq("charity_id", id),
  ]);
  if (charity.error) throw charity.error;
  if (!charity.data) notFound();

  return {
    charity: charity.data,
    priv: priv.data,
    documents: (docs.data ?? []) as CharityDocument[],
    categoryIds: (cats.data ?? []).map((c) => c.category_id as string),
  };
}

export async function loadCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name_en, name_he")
    .order("sort_order");
  if (error) throw error;
  return data;
}

export function publicImageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/charity-public/${path}`;
}

export type CharityPhoto = { id: string; storage_path: string; caption_en: string | null; created_at: string };
export type CharityUpdate = { id: string; body_en: string; photo_path: string | null; created_at: string };

/** A charity's photos (oldest first) and latest updates, read under row-level security. */
export async function loadStories(charityId: string, updatesLimit = 20) {
  const supabase = await createClient();
  const [photos, updates] = await Promise.all([
    supabase.from("charity_photos").select("id, storage_path, caption_en, created_at").eq("charity_id", charityId).order("created_at"),
    supabase.from("charity_updates").select("id, body_en, photo_path, created_at").eq("charity_id", charityId).order("created_at", { ascending: false }).limit(updatesLimit),
  ]);
  return { photos: (photos.data ?? []) as CharityPhoto[], updates: (updates.data ?? []) as CharityUpdate[] };
}
