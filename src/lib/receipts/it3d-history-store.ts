import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { It3dPeriod } from "./it3d";
import type { It3dHistoryEntry, It3dHistoryKind } from "./it3d-history";

/**
 * The IT3(d) history table (migration 20261110000005) is closed to browsers: everything here uses the service
 * role, and every caller has first checked the signed-in person is the charity's owner (authoriseIt3d for the
 * downloads; loadCharityForManager and isOwner for the page and the mark). Every query names the charity, so an
 * entry of another charity is never read or changed.
 */

const COLUMNS = "id, tax_year, period, kind, test_data, receipts, donors, donations, total_cents, receipts_left_out, created_by, created_at, uploaded_on, upload_reference, marked_at";

export type It3dHistoryRow = {
  id: string;
  taxYear: number;
  period: It3dPeriod;
  kind: It3dHistoryKind;
  testData: boolean;
  receipts: number;
  donors: number;
  donations: number;
  totalCents: number;
  receiptsLeftOut: number;
  /** The person's name (or email) as Givezy has it now; null when their account is gone. */
  who: string | null;
  createdAt: string;
  uploadedOn: string | null;
  uploadReference: string | null;
  markedAt: string | null;
};

type Raw = {
  id: string; tax_year: number; period: It3dPeriod; kind: It3dHistoryKind; test_data: boolean; receipts: number; donors: number; donations: number;
  total_cents: number | string; receipts_left_out: number; created_by: string | null; created_at: string; uploaded_on: string | null;
  upload_reference: string | null; marked_at: string | null;
};

const shape = (r: Raw, who: string | null): It3dHistoryRow => ({
  id: r.id, taxYear: r.tax_year, period: r.period, kind: r.kind, testData: r.test_data, receipts: r.receipts, donors: r.donors, donations: r.donations,
  totalCents: Number(r.total_cents), receiptsLeftOut: r.receipts_left_out, who, createdAt: r.created_at, uploadedOn: r.uploaded_on,
  uploadReference: r.upload_reference, markedAt: r.marked_at,
});

/**
 * Write one download into the history, before the file is sent. Like the audit log, a failure is never swallowed:
 * the download stops with a plain message rather than leave a gap in the charity's record.
 */
export async function recordIt3dDownload(entry: It3dHistoryEntry): Promise<void> {
  const { error } = await createAdminClient().from("charity_it3d_history").insert(entry);
  if (error) throw new Error(`IT3(d) history write failed: ${error.message}`);
}

/** How many entries the page shows. */
export const HISTORY_SHOWN = 50;

/** The charity's history, newest first, and whether there are older entries than the page shows. */
export async function loadIt3dHistory(charityId: string, limit = HISTORY_SHOWN): Promise<{ rows: It3dHistoryRow[]; more: boolean }> {
  const db = createAdminClient();
  const { data, error } = await db.from("charity_it3d_history").select(COLUMNS).eq("charity_id", charityId).order("created_at", { ascending: false }).order("id").limit(limit + 1);
  if (error) throw new Error(error.message);
  const raw = (data ?? []) as unknown as Raw[];
  const shown = raw.slice(0, limit);
  const ids = [...new Set(shown.map((r) => r.created_by).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people, error: peopleError } = await db.from("profiles").select("id, full_name, email").in("id", ids);
    if (peopleError) throw new Error(peopleError.message);
    for (const p of people ?? []) names.set(p.id as string, String((p.full_name as string | null)?.trim() || p.email || ""));
  }
  return { rows: shown.map((r) => shape(r, (r.created_by && names.get(r.created_by)) || null)), more: raw.length > limit };
}

/** One entry of this charity, or null. */
export async function loadIt3dHistoryEntry(charityId: string, id: string): Promise<It3dHistoryRow | null> {
  const { data, error } = await createAdminClient().from("charity_it3d_history").select(COLUMNS).eq("charity_id", charityId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? shape(data as unknown as Raw, null) : null;
}

/**
 * Keep the owner's own mark on an entry that has none. False when the entry isn't this charity's, or someone
 * marked it a moment ago (their mark is kept).
 */
export async function markIt3dUploaded(args: { charityId: string; id: string; userId: string; uploadedOn: string; reference: string | null; now?: Date }): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("charity_it3d_history")
    .update({ uploaded_on: args.uploadedOn, upload_reference: args.reference, marked_by: args.userId, marked_at: (args.now ?? new Date()).toISOString() })
    .eq("charity_id", args.charityId)
    .eq("id", args.id)
    .is("uploaded_on", null)
    .select("id, tax_year, period, kind");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return false;
  // What was marked, never the reference (the charity's own words).
  await logAudit({ actorUserId: args.userId, action: "charity.it3d_marked_uploaded", entityType: "charity", entityId: args.charityId, details: { historyId: args.id, taxYear: row.tax_year, period: row.period, kind: row.kind } });
  return true;
}

/** Take the mark off again (Undo). False when there was no mark to take off. */
export async function clearIt3dUploaded(args: { charityId: string; id: string; userId: string }): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("charity_it3d_history")
    .update({ uploaded_on: null, upload_reference: null, marked_by: null, marked_at: null })
    .eq("charity_id", args.charityId)
    .eq("id", args.id)
    .not("uploaded_on", "is", null)
    .select("id, tax_year, period, kind");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return false;
  await logAudit({ actorUserId: args.userId, action: "charity.it3d_mark_removed", entityType: "charity", entityId: args.charityId, details: { historyId: args.id, taxYear: row.tax_year, period: row.period, kind: row.kind } });
  return true;
}
