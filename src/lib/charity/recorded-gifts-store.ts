import "server-only";
import { createHash } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { encrypt, last4, receiptIdentity } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { giftKey, paidAtOf, taxYearOfGift, type CleanGift } from "./recorded-gifts";

/**
 * Saving gifts a charity records itself. Every call here comes after the caller checked the signed-in person
 * manages the charity (loadCharityForManager); donations are server-only, so this uses the service role.
 */

/** Keys (see giftKey) of every gift this charity has recorded, to catch the same gift twice. */
export async function recordedKeys(charityId: string): Promise<Set<string>> {
  const db = createAdminClient();
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("donations")
      .select("amount_cents, paid_at, external_ref, donation_checkout_details(email)")
      .eq("charity_id", charityId)
      .eq("gateway", "recorded")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const d of data ?? []) {
      const det = (Array.isArray(d.donation_checkout_details) ? d.donation_checkout_details[0] : d.donation_checkout_details) as { email: string } | null;
      const date = String(d.paid_at).slice(0, 10);
      keys.add(giftKey({ reference: d.external_ref as string | null, email: det?.email ?? "", amountCents: Number(d.amount_cents), date }));
    }
    if (!data || data.length < 1000) break;
  }
  return keys;
}

/** The charity's campaigns by lower-case title, to match a campaign typed in a file. */
export async function campaignsByTitle(charityId: string): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient().from("campaigns").select("id, title").eq("charity_id", charityId);
  if (error) throw error;
  return new Map((data ?? []).map((c) => [String(c.title).trim().toLowerCase(), c.id as string]));
}

export type RecordResult = { ok: true; importId: string | null; ids: string[] } | { ok: false; message: string };

/**
 * Record gifts: one typed in, or a whole file (with `importOf`). One database call, one transaction: all or
 * nothing, even if the website stops part way. ID and tax numbers are encrypted here; the key never leaves
 * the server.
 */
export async function recordGifts(args: {
  charityId: string;
  userId: string;
  gifts: (CleanGift & { campaignId: string | null })[];
  importOf?: { fileName: string; fingerprint: string; confirmedAt: string };
}): Promise<RecordResult> {
  const gifts = args.gifts.map((g) => ({
    donor_type: g.donorType,
    email: g.email,
    first_name: g.firstName,
    last_name: g.lastName,
    organisation_name: g.organisationName,
    registration_number: g.registrationNumber,
    phone: g.phone,
    amount_cents: g.amountCents,
    paid_at: paidAtOf(g.date),
    tax_year: taxYearOfGift(g.date),
    method: g.method,
    wants_18a: g.wants18a,
    campaign_id: g.campaignId,
    reference: g.reference,
    ...(g.wants18a
      ? {
          receipt_identity: receiptIdentity({ donorType: g.donorType, idNumber: g.idNumber ?? undefined, taxReference: g.taxReference ?? undefined, registrationNumber: g.registrationNumber ?? undefined }),
          id_number_encrypted: g.idNumber ? encrypt(g.idNumber) : null,
          id_number_last4: g.idNumber ? last4(g.idNumber) : null,
          tax_reference_encrypted: g.taxReference ? encrypt(g.taxReference) : null,
          tax_reference_last4: g.taxReference ? last4(g.taxReference) : null,
          address_line1: g.addressLine1,
          address_line2: g.addressLine2,
          suburb: g.suburb,
          city: g.city,
          postal_code: g.postalCode,
        }
      : {}),
  }));
  const { data, error } = await createAdminClient().rpc("record_gifts", {
    p_charity_id: args.charityId,
    p_user_id: args.userId,
    p_import: args.importOf ? { file_name: args.importOf.fileName.slice(0, 200) || "file.csv", file_fingerprint: args.importOf.fingerprint, confirmed_at: args.importOf.confirmedAt } : null,
    p_gifts: gifts,
  });
  if (error) {
    if (/gift_imports_once/.test(error.message)) return { ok: false, message: "You've already imported this exact file, so nothing was recorded again. It's under Earlier imports below." };
    if (/donations_recorded_ref/.test(error.message)) return { ok: false, message: "One of these references is already on a gift you recorded, so nothing was recorded. Check the references and try again." };
    console.error("[recorded-gifts]", error.message);
    return { ok: false, message: "Something went wrong while saving, so nothing was recorded. Please try again." };
  }
  const out = data as { import_id: string | null; donation_ids: string[] };
  await logAudit({
    actorUserId: args.userId,
    action: out.import_id ? "gifts.imported" : "gift.recorded",
    entityType: "charity",
    entityId: args.charityId,
    details: { gifts: out.donation_ids.length, importId: out.import_id, cents: args.gifts.reduce((t, g) => t + g.amountCents, 0) },
  });
  return { ok: true, importId: out.import_id, ids: out.donation_ids };
}

export type RemoveResult = { ok: true; removed: number } | { ok: false; why: "gone" | "receipted" };

/** Remove recorded gifts (one, or a whole import), only while none of them is on a receipt. */
export async function removeRecorded(args: { charityId: string; userId: string; donationId?: string; importId?: string }): Promise<RemoveResult> {
  const db = createAdminClient();
  let q = db.from("donations").select("id, import_id").eq("charity_id", args.charityId).eq("gateway", "recorded");
  q = args.importId ? q.eq("import_id", args.importId) : q.eq("id", args.donationId ?? "");
  const { data: rows, error } = await q;
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.id as string);
  if (!ids.length) return { ok: false, why: "gone" };
  const { count, error: linkError } = await db.from("s18a_receipt_donations").select("donation_id", { count: "exact", head: true }).in("donation_id", ids);
  if (linkError) throw linkError;
  if ((count ?? 0) > 0) return { ok: false, why: "receipted" };
  const { error: delError } = await db.from("donations").delete().in("id", ids).eq("gateway", "recorded");
  if (delError) {
    // A receipt was issued in between (the database refuses to remove a receipted gift).
    if (/cannot be deleted/.test(delError.message)) return { ok: false, why: "receipted" };
    throw delError;
  }
  await dropEmptyImports(args.charityId, [...new Set((rows ?? []).map((r) => r.import_id as string | null).filter((x): x is string => Boolean(x)))]);
  await logAudit({ actorUserId: args.userId, action: "gifts.removed", entityType: "charity", entityId: args.charityId, details: { removed: ids.length, importId: args.importId ?? null } });
  return { ok: true, removed: ids.length };
}

/** A short fingerprint of a file's text, so "Import" records exactly the file that was checked. */
export function fileFingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/** The charity's recent imports, newest first, with the gifts still recorded from each (some may have been removed one by one). */
export async function listImports(charityId: string) {
  const db = createAdminClient();
  const { data, error } = await db.from("gift_imports").select("id, file_name, created_at").eq("charity_id", charityId).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  const imports = (data ?? []) as { id: string; file_name: string; created_at: string }[];
  const live = new Map<string, { gifts: number; cents: number }>();
  if (imports.length) {
    const { data: rows, error: rowError } = await db.from("donations").select("import_id, amount_cents").eq("charity_id", charityId).in("import_id", imports.map((i) => i.id));
    if (rowError) throw rowError;
    for (const r of rows ?? []) {
      const t = live.get(r.import_id as string) ?? { gifts: 0, cents: 0 };
      t.gifts += 1;
      t.cents += Number(r.amount_cents);
      live.set(r.import_id as string, t);
    }
  }
  return imports
    .map((i) => ({ ...i, gifts: live.get(i.id)?.gifts ?? 0, total_cents: live.get(i.id)?.cents ?? 0 }))
    .filter((i) => i.gifts > 0);
}

/**
 * Imports with no gifts left (removed as a whole, or one by one) are cleared away, so the corrected file can be
 * imported again. An import that still has gifts is kept.
 */
export async function dropEmptyImports(charityId: string, importIds: string[]) {
  const db = createAdminClient();
  for (const id of importIds) {
    const { count, error } = await db.from("donations").select("id", { count: "exact", head: true }).eq("import_id", id);
    if (error) throw error;
    if (!count) {
      const del = await db.from("gift_imports").delete().eq("id", id).eq("charity_id", charityId);
      if (del.error) throw del.error;
    }
  }
}
