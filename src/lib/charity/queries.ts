import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { requireSecondStep } from "@/lib/mfa";
import { currentNext } from "@/lib/current-path";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { DocumentType } from "./validation";
import { can } from "./permissions";
import { viewerRole } from "./team";
import { UPDATE_VIDEO_COLUMNS, withUpdateVideos, type ProfileVideo } from "./video";

export const CHARITY_FIELDS =
  "id, slug, quickgive_code, name_en, legal_name_en, description_en, funds_use_en, thank_you_en, impact_en, impact_unit_cents, impact_unit_one, impact_unit_many, suggested_amounts_cents, website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, address_line1, address_line2, suburb, city, postal_code, status, rejection_reason, is_verified, verified_at, is_s18a, s18a_confirmed_at, mandate_signed_at, mandate_document_path, gateway, gateway_subaccount_ref, approved_at, created_at, updated_at";

export const PRIVATE_FIELDS =
  "charity_id, contact_name, contact_email, contact_phone, bank_name, bank_account_holder, bank_account_last4, bank_branch_code, bank_verified_at, notify_donations";
/** What every member reads as themselves; the bank columns are closed to browsers (migration 20261110000009). */
const MEMBER_PRIVATE_FIELDS = "charity_id, contact_name, contact_email, contact_phone, notify_donations";
const BANK_FIELDS = "bank_name, bank_account_holder, bank_account_last4, bank_branch_code, bank_verified_at";
const NO_BANK = { bank_name: null, bank_account_holder: null, bank_account_last4: null, bank_branch_code: null, bank_verified_at: null };

export type PrivateRow = {
  charity_id: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  bank_name: string | null; bank_account_holder: string | null; bank_account_last4: string | null; bank_branch_code: string | null;
  bank_verified_at: string | null; notify_donations: boolean | null;
  /** A bank account is saved (the account itself is only filled in for the owner and finance). */
  bank_set: boolean;
};

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
    // Back to the page asked for (not just the overview) once the code is in.
    await requireSecondStep(await currentNext(`/charity-admin/${id}`));
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
    supabase.from("charity_private").select(MEMBER_PRIVATE_FIELDS).eq("charity_id", id).maybeSingle(),
    supabase
      .from("charity_documents")
      .select("id, document_type, file_name, storage_path, signed_on, uploaded_at")
      .eq("charity_id", id)
      .order("uploaded_at"),
    supabase.from("charity_categories").select("category_id").eq("charity_id", id),
  ]);
  if (charity.error) throw charity.error;
  if (!charity.data) notFound();

  // The bank account: the owner and finance (and Givezy) only (team roles, 10/11/2026), read by the server after
  // that check. Everyone else gets the same shape with the bank left empty, and pages say who can see it.
  // Whether a bank account is saved (for the application's checklist) is known to everyone; the account itself isn't.
  const canBank = can(await viewerRole(id), "bank_view");
  let bank: Record<string, unknown> = NO_BANK;
  let bankSet = false;
  if (priv.data) {
    const { data, error } = await createAdminClient().from("charity_private").select(BANK_FIELDS).eq("charity_id", id).maybeSingle();
    if (error) throw error;
    bankSet = Boolean(data?.bank_account_last4 && data?.bank_branch_code);
    if (canBank) bank = data ?? NO_BANK;
  }

  // Which documents are uploaded, for the application's checklist: the bank confirmation letter is only shown to
  // the owner and finance (team roles), but everyone who may submit needs to know it's there.
  const documents = (docs.data ?? []) as CharityDocument[];
  let documentTypes = documents.map((d) => d.document_type);
  if (!canBank) {
    const { data: letter, error: letterError } = await createAdminClient().from("charity_documents").select("id").eq("charity_id", id).eq("document_type", "bank_confirmation").limit(1);
    if (letterError) throw letterError;
    if (letter?.length && !documentTypes.includes("bank_confirmation")) documentTypes = [...documentTypes, "bank_confirmation"];
  }

  return {
    charity: charity.data,
    documentTypes,
    priv: priv.data ? ({ ...priv.data, ...bank, bank_set: bankSet } as Record<string, unknown> as PrivateRow) : null,
    canBank,
    documents,
    categoryIds: (cats.data ?? []).map((c) => c.category_id as string),
  };
}

export async function loadCategories() {
  // Public for everyone, so it never reads the request (the home page is served from cache).
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name_en")
    .order("sort_order")
    .order("name_en");
  if (error) throw error;
  return data;
}

export function publicImageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/charity-public/${path}`;
}

export type CharityPhoto = { id: string; storage_path: string; caption_en: string | null; created_at: string };
export type CharityUpdate = { id: string; body_en: string; photo_path: string | null; created_at: string; video: ProfileVideo | null };

/** A charity's photos (oldest first) and latest updates, read under row-level security. */
export async function loadStories(charityId: string, updatesLimit = 20) {
  const supabase = await createClient();
  const [photos, updates] = await Promise.all([
    supabase.from("charity_photos").select("id, storage_path, caption_en, created_at").eq("charity_id", charityId).order("created_at"),
    supabase.from("charity_updates").select("id, body_en, photo_path, created_at").eq("charity_id", charityId).order("created_at", { ascending: false }).limit(updatesLimit),
  ]);
  const rows = (updates.data ?? []) as Omit<CharityUpdate, "video">[];
  // An update's video is a bonus, read on its own: before its database change runs (or if it can't be read), every
  // update still shows, without one.
  const videos = rows.length
    ? await supabase.from("charity_updates").select(UPDATE_VIDEO_COLUMNS).in("id", rows.map((u) => u.id))
    : { data: [], error: null };
  return { photos: (photos.data ?? []) as CharityPhoto[], updates: withUpdateVideos(rows, videos.error ? null : videos.data) as CharityUpdate[] };
}
