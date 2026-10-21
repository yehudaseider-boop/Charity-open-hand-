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

/** The donor record for this email and type (shared with online gifts), made if there is none. */
async function donorFor(g: CleanGift): Promise<string> {
  const db = createAdminClient();
  const reg = g.donorType === "individual" ? null : g.registrationNumber;
  for (let attempt = 0; attempt < 2; attempt++) {
    let q = db.from("donors").select("id, registration_number").eq("email", g.email).eq("donor_type", g.donorType);
    if (reg) q = q.eq("registration_number", reg);
    else if (g.donorType === "individual") q = q.is("registration_number", null);
    const { data: matches, error } = await q.limit(2);
    if (error) throw error;
    const existing = matches?.length === 1 ? matches[0] : (matches ?? []).find((m) => m.registration_number === reg);
    if (existing) return existing.id as string;
    // Not the donor's own confirmation of age or consent: the charity recorded the gift (see gift_imports).
    const { data, error: insError } = await db
      .from("donors")
      .insert({
        email: g.email,
        donor_type: g.donorType,
        registration_number: reg,
        first_name: g.firstName,
        last_name: g.lastName,
        organisation_name: g.organisationName,
        phone: g.phone,
        id_number_last4: g.idNumber ? last4(g.idNumber) : null,
        tax_reference_last4: g.taxReference ? last4(g.taxReference) : null,
        address_line1: g.addressLine1,
        address_line2: g.addressLine2,
        suburb: g.suburb,
        city: g.city,
        postal_code: g.postalCode,
      })
      .select("id")
      .single();
    if (data) return data.id as string;
    if (insError?.code !== "23505") throw insError; // someone else made it a moment ago: look again
  }
  throw new Error("Could not create the donor");
}

export type RecordResult = { ok: true; ids: string[] } | { ok: false; message: string };

/**
 * Record gifts: one typed in, or a whole file (with `importOf`). All or nothing: if one fails, the ones
 * already saved are removed again and nothing is kept.
 */
export async function recordGifts(args: {
  charityId: string;
  userId: string;
  gifts: (CleanGift & { campaignId: string | null })[];
  importOf?: { fileName: string; confirmedAt: string };
}): Promise<RecordResult> {
  const db = createAdminClient();
  let importId: string | null = null;
  if (args.importOf) {
    const { data, error } = await db
      .from("gift_imports")
      .insert({
        charity_id: args.charityId,
        file_name: args.importOf.fileName.slice(0, 200) || "file.csv",
        gifts: args.gifts.length,
        total_cents: args.gifts.reduce((t, g) => t + g.amountCents, 0),
        created_by: args.userId,
        confirmed_at: args.importOf.confirmedAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    importId = data.id as string;
  }
  const saved: string[] = [];
  try {
    for (const g of args.gifts) {
      const donorId = await donorFor(g);
      const { data, error } = await db
        .from("donations")
        .insert({
          donor_id: donorId,
          charity_id: args.charityId,
          campaign_id: g.campaignId,
          amount_cents: g.amountCents,
          contribution_cents: 0,
          platform_fee_cents: 0,
          fee_vat_cents: 0,
          processing_charge_cents: 0,
          total_charged_cents: g.amountCents,
          status: "paid",
          paid_at: paidAtOf(g.date),
          tax_year: taxYearOfGift(g.date),
          gateway: "recorded",
          gateway_ref: null,
          wants_18a: g.wants18a,
          recorded_method: g.method,
          recorded_by: args.userId,
          import_id: importId,
          external_ref: g.reference,
          came_from: "recorded",
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error(`The reference "${g.reference}" is already on another gift you recorded.`);
        throw error;
      }
      saved.push(data.id as string);
      const details = await db.from("donation_checkout_details").insert({
        donation_id: data.id,
        donor_type: g.donorType,
        email: g.email,
        first_name: g.firstName,
        last_name: g.lastName,
        organisation_name: g.organisationName,
        registration_number: g.registrationNumber,
        phone: g.phone,
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
      });
      if (details.error) throw details.error;
    }
  } catch (e) {
    // Nothing half-done: take back what this call saved (none of it can be on a receipt yet).
    if (saved.length) await db.from("donations").delete().in("id", saved);
    if (importId) await db.from("gift_imports").delete().eq("id", importId);
    const message = e instanceof Error && /already on another gift/.test(e.message) ? e.message : "Something went wrong while saving, so nothing was recorded. Please try again.";
    if (!(e instanceof Error && /already on another gift/.test(e.message))) console.error("[recorded-gifts]", e);
    return { ok: false, message };
  }
  await logAudit({
    actorUserId: args.userId,
    action: importId ? "gifts.imported" : "gift.recorded",
    entityType: "charity",
    entityId: args.charityId,
    details: { gifts: saved.length, importId, cents: args.gifts.reduce((t, g) => t + g.amountCents, 0) },
  });
  return { ok: true, ids: importId ? [importId, ...saved] : saved };
}

export type RemoveResult = { ok: true; removed: number } | { ok: false; why: "gone" | "receipted" };

/** Remove recorded gifts (one, or a whole import), only while none of them is on a receipt. */
export async function removeRecorded(args: { charityId: string; userId: string; donationId?: string; importId?: string }): Promise<RemoveResult> {
  const db = createAdminClient();
  let q = db.from("donations").select("id").eq("charity_id", args.charityId).eq("gateway", "recorded");
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
  if (args.importId) await db.from("gift_imports").delete().eq("id", args.importId).eq("charity_id", args.charityId);
  await logAudit({ actorUserId: args.userId, action: "gifts.removed", entityType: "charity", entityId: args.charityId, details: { removed: ids.length, importId: args.importId ?? null } });
  return { ok: true, removed: ids.length };
}

/** A short fingerprint of a file's text, so "Import" records exactly the file that was checked. */
export function fileFingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/** The charity's recent imports, newest first. */
export async function listImports(charityId: string) {
  const { data, error } = await createAdminClient()
    .from("gift_imports")
    .select("id, file_name, gifts, total_cents, created_at")
    .eq("charity_id", charityId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as { id: string; file_name: string; gifts: number; total_cents: number; created_at: string }[];
}
