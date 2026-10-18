import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUndo, isActionKind, type ActionKind, type Details } from "./done";

/**
 * Records each dashboard action (for "what just happened") and takes it back on request. Every call
 * here comes after the caller checked the signed-in person manages the charity (loadCharityForManager);
 * the table itself is closed to browsers, so this uses the service role.
 */

/** What taking an action back needs. Stored with the action; never sent to the browser. */
export type Undo =
  /** Put columns back as they were, if nobody has changed them again since. */
  | { type: "restore"; table: "charities" | "charity_private"; before: Record<string, unknown>; after: Record<string, unknown>; categories?: string[]; categoriesAfter?: string[]; dropFile?: { bucket: string; path: string } }
  /** Remove a row this action added (and its file). */
  | { type: "delete"; table: "campaigns" | "charity_updates" | "charity_photos" | "charity_documents"; id: string; file?: { bucket: string; path: string } | null }
  /** Put back a row this action removed (its file was kept for this). */
  | { type: "reinsert"; table: "charity_updates" | "charity_photos" | "charity_documents"; row: Record<string, unknown> }
  /** Start a campaign again that this action ended. */
  | { type: "reopen_campaign"; id: string };

export type ActionRow = { id: string; charity_id: string; kind: ActionKind; details: Details; undo: Undo | null; undone_at: string | null; created_at: string };

export async function recordAction(charityId: string, userId: string, kind: ActionKind, details: Details, undo: Undo | null): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db.from("charity_actions").insert({ charity_id: charityId, user_id: userId, kind, details, undo }).select("id").single();
  if (error) throw error;
  // Kept for 30 days: enough for "what just happened", no longer. Files kept only so Undo could put them
  // back go with the rows.
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: old } = await db.from("charity_actions").select("id, undo, undone_at").eq("charity_id", charityId).lt("created_at", cutoff);
  for (const row of old ?? []) {
    if (row.undone_at) continue;
    const kept = keptFile(row.undo as Undo | null);
    if (kept && kept.path.startsWith(`${charityId}/`) && !kept.path.includes("..")) await db.storage.from(kept.bucket).remove([kept.path]).catch(() => undefined);
  }
  await db.from("charity_actions").delete().eq("charity_id", charityId).lt("created_at", cutoff);
  return data.id as string;
}

/** The file an undo payload keeps on hand (the removed photo, the previous logo), if any. */
function keptFile(undo: Undo | null): { bucket: string; path: string } | null {
  if (!undo) return null;
  if (undo.type === "reinsert") {
    const r = undo.row as Record<string, unknown>;
    const path = (r.storage_path ?? r.photo_path) as string | undefined;
    return path ? { bucket: undo.table === "charity_documents" ? "charity-documents" : "charity-public", path } : null;
  }
  if (undo.type === "restore" && undo.dropFile) {
    // The previous logo or cover (undo.before) was kept so it could come back.
    const prev = Object.values(undo.before).find((v) => typeof v === "string" && v.startsWith(`${undo.dropFile!.path.split("/")[0]}/`)) as string | undefined;
    return prev ? { bucket: undo.dropFile.bucket, path: prev } : null;
  }
  return null;
}

export async function loadAction(charityId: string, id: string): Promise<ActionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await createAdminClient()
    .from("charity_actions")
    .select("id, charity_id, kind, details, undo, undone_at, created_at")
    .eq("id", id)
    .eq("charity_id", charityId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isActionKind(data.kind)) return null;
  return data as ActionRow;
}

export type UndoFailure = "gone" | "late" | "changed" | "given" | "full" | "locked" | "ended" | "error";
export type UndoResult = { ok: true; row: ActionRow } | { ok: false; why: UndoFailure; row: ActionRow | null };

const editable = (status: string) => status === "draft" || status === "rejected";
const APPLICATION_KINDS: ActionKind[] = ["organisation_saved", "address_saved", "bank_saved", "document_uploaded", "document_removed"];

/** Take an action back. Safe to call twice: only the first call does anything. */
export async function undoAction(charityId: string, id: string, userId: string, charityStatus: string, now = new Date()): Promise<UndoResult> {
  const row = await loadAction(charityId, id);
  if (!row || !row.undo) return { ok: false, why: "gone", row };
  if (!canUndo(row, now)) return { ok: false, why: row.undone_at ? "gone" : "late", row };
  if (APPLICATION_KINDS.includes(row.kind) && !editable(charityStatus)) return { ok: false, why: "locked", row };

  const db = createAdminClient();
  // Claim it first, so two taps (or two admins) can't take it back twice.
  const { data: claimed, error: claimError } = await db
    .from("charity_actions")
    .update({ undone_at: now.toISOString(), undone_by: userId })
    .eq("id", id)
    .is("undone_at", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed?.length) return { ok: false, why: "gone", row };

  const why = await apply(charityId, row.undo).catch((e) => {
    console.error("[undo]", row.kind, e instanceof Error ? e.message : e);
    return "error" as const;
  });
  if (why) {
    // Nothing changed: let them see the reason, and try again if it was a hiccup.
    await db.from("charity_actions").update({ undone_at: null, undone_by: null }).eq("id", id);
    return { ok: false, why, row };
  }
  await logAudit({ actorUserId: userId, action: "charity.action_undone", entityType: "charity", entityId: charityId, details: { kind: row.kind, actionId: id } });
  return { ok: true, row: { ...row, undone_at: now.toISOString() } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function apply(charityId: string, undo: Undo): Promise<UndoFailure | null> {
  const db = createAdminClient();
  const ownPath = (p: string) => p.startsWith(`${charityId}/`) && !p.includes("..");
  switch (undo.type) {
    case "restore": {
      const key = undo.table === "charities" ? "id" : "charity_id";
      const cols = Object.keys(undo.after);
      const { data: now, error } = await db.from(undo.table).select(cols.join(", ")).eq(key, charityId).maybeSingle();
      if (error) throw error;
      if (!now) return "gone";
      // Changed again since (by this person or another admin): don't overwrite their newer work.
      if (cols.some((c) => !same((now as unknown as Record<string, unknown>)[c], undo.after[c]))) return "changed";
      if (undo.categoriesAfter) {
        const { data: cats, error: catError } = await db.from("charity_categories").select("category_id").eq("charity_id", charityId);
        if (catError) throw catError;
        const nowCats = (cats ?? []).map((c) => c.category_id as string).sort();
        if (!same(nowCats, [...undo.categoriesAfter].sort())) return "changed";
      }
      const { error: upError } = await db.from(undo.table).update(undo.before).eq(key, charityId);
      if (upError) throw upError;
      if (undo.categories) {
        const del = await db.from("charity_categories").delete().eq("charity_id", charityId);
        if (del.error) throw del.error;
        if (undo.categories.length) {
          const ins = await db.from("charity_categories").insert(undo.categories.map((category_id) => ({ charity_id: charityId, category_id })));
          if (ins.error) throw ins.error;
        }
      }
      if (undo.dropFile && ownPath(undo.dropFile.path)) await db.storage.from(undo.dropFile.bucket).remove([undo.dropFile.path]);
      return null;
    }
    case "delete": {
      if (undo.table === "campaigns") {
        // A campaign someone has given to stays: it can be ended instead.
        const { count, error } = await db.from("donations").select("id", { count: "exact", head: true }).eq("campaign_id", undo.id).in("status", ["paid", "refunded", "charged_back"]);
        if (error) throw error;
        if ((count ?? 0) > 0) return "given";
        // Abandoned or declined checkouts for it aren't gifts: let them go so the campaign can be removed.
        const { error: unlink } = await db.from("donations").update({ campaign_id: null }).eq("campaign_id", undo.id).in("status", ["pending", "failed"]);
        if (unlink) throw unlink;
      }
      const { data, error } = await db.from(undo.table).delete().eq("id", undo.id).eq("charity_id", charityId).select("id");
      if (error) throw error;
      if (!data?.length) return "gone";
      if (undo.file && ownPath(undo.file.path)) await db.storage.from(undo.file.bucket).remove([undo.file.path]);
      return null;
    }
    case "reinsert": {
      if (undo.row.charity_id !== charityId) return "gone";
      const { error } = await db.from(undo.table).insert(undo.row);
      if (error) {
        if (/up to \d+/.test(error.message)) return "full";
        if (/duplicate key/.test(error.message)) return "gone";
        throw error;
      }
      return null;
    }
    case "reopen_campaign": {
      const { data: c, error } = await db.from("campaigns").select("status, ends_at").eq("id", undo.id).eq("charity_id", charityId).maybeSingle();
      if (error) throw error;
      if (!c || c.status !== "ended") return "gone";
      if (c.ends_at && new Date(c.ends_at as string) <= new Date()) return "ended";
      const { error: upError } = await db.from("campaigns").update({ status: "active" }).eq("id", undo.id).eq("charity_id", charityId);
      if (upError) {
        if (/up to 3/.test(upError.message)) return "full";
        throw upError;
      }
      return null;
    }
  }
}

/** Why something couldn't be taken back, in plain words. */
export function undoFailureText(why: UndoFailure): string {
  switch (why) {
    case "gone": return "It has already been taken back.";
    case "late": return "It's been more than 30 minutes, so it can't be taken back here. You can change it again by hand.";
    case "changed": return "It was changed again since, so it can't be taken back here. Your newer changes are kept.";
    case "given": return "Donors have already given to it, so it can't be removed. You can end it instead.";
    case "full": return "There's no room for it: you're at the limit. Remove or end one first, then try again.";
    case "locked": return "Your application has been submitted, so your details are locked while we review them.";
    case "ended": return "Its last day has passed, so it can't run again. Start a new campaign instead.";
    case "error": return "Something went wrong and nothing was changed. Please try again.";
  }
}
