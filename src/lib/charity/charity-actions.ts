import "server-only";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { dropEmptyImports } from "./recorded-gifts-store";
import { removeContactImport } from "./contacts-store";
import { memberRole } from "./team";
import { can, isRole, permissionForAction } from "./permissions";
import { removeDecisions } from "@/lib/receipts/runs";
import { canUndo, isActionKind, type ActionKind, type Details } from "./done";
import { readJourneyState, removeEnrolments, writeJourney, type JourneyState } from "./journey-write";
import { GENERAL, type JourneyRef } from "./journey";

/**
 * Records each dashboard action (for "what just happened") and takes it back on request. Every call
 * here comes after the caller checked the signed-in person manages the charity (loadCharityForManager);
 * the table itself is closed to browsers, so this uses the service role.
 */

/** What taking an action back needs. Stored with the action; never sent to the browser. */
export type Undo =
  /** Put columns back as they were, if nobody has changed them again since. */
  | { type: "restore"; table: "charities" | "charity_private"; before: Record<string, unknown>; after: Record<string, unknown>; categories?: string[]; categoriesAfter?: string[]; dropFile?: { bucket: string; path: string } }
  /**
   * Put the charity's one focus back as it was (10/11/2026): the row before this action, or none. Only if it is
   * still as this action left it.
   */
  | { type: "focus"; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
  /** Remove a row this action added (and its file). */
  | { type: "delete"; table: "campaigns" | "charity_updates" | "charity_photos" | "charity_documents"; id: string; file?: { bucket: string; path: string } | null }
  /** Put back a row this action removed (its file was kept for this). */
  | { type: "reinsert"; table: "charity_updates" | "charity_photos" | "charity_documents"; row: Record<string, unknown> }
  /** Start a campaign again that this action ended. */
  | { type: "reopen_campaign"; id: string }
  /**
   * Withdraw a receipt approval, while Givezy hasn't signed it off yet, and the certificate approvals that
   * "Approve all" made with it (09/11/2026).
   */
  | { type: "cancel_receipt_run"; id: string; decisionIds?: string[] }
  /**
   * Take back the charity's decision on one planned s18A receipt (09/11/2026), while its list isn't with Givezy:
   * remove the decision this action wrote, put back the one it replaced (or a reopened one), and put back the
   * donor's name and address a correction replaced, if nobody has changed them since. Server-only, kept 30 days.
   */
  | {
      type: "receipt_decision";
      taxYear: number;
      remove?: { id: string; decidedAt: string };
      reinsert?: Record<string, unknown> | null;
      restore?: { donationId: string; before: Record<string, string | null>; after: Record<string, string | null> }[];
    }
  /** Remove gifts the charity recorded (one, or a whole import), while none is on a receipt. */
  | { type: "remove_recorded"; donationIds?: string[]; importId?: string }
  /** Remove a whole import of a charity's own donor list (contacts). Only an owner may. */
  | { type: "remove_contacts"; importId: string }
  /**
   * Put the donor journey back as it was (10/11/2026): its switch and its emails. Only if nobody has changed it since.
   * Only an owner may.
   */
  | { type: "journey"; ref?: JourneyRef; before: JourneyState; after: JourneyState }
  /** Take off the donors "Add my existing donors" added, those who haven't had an email yet. Only an owner may. */
  | { type: "journey_enrolments"; ids: string[] }
  /** Take away access this action gave (an admin, never an owner). Only an owner may. */
  | { type: "remove_member"; userId: string }
  /** Put someone's role back (CRM step 9), if nobody has changed it again since. */
  | { type: "set_role"; userId: string; from: string; to: string };

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

export type UndoFailure = "gone" | "removed" | "late" | "changed" | "given" | "journeyed" | "full" | "locked" | "ended" | "issued" | "owner" | "sent" | "emailed" | "error";
export type UndoResult = { ok: true; row: ActionRow } | { ok: false; why: UndoFailure; row: ActionRow | null };

const editable = (status: string) => status === "draft" || status === "rejected";
const APPLICATION_KINDS: ActionKind[] = ["organisation_saved", "address_saved", "bank_saved", "document_uploaded", "document_removed"];

/** Take an action back. Safe to call twice: only the first call does anything. */
export async function undoAction(charityId: string, id: string, userId: string, charityStatus: string, now = new Date()): Promise<UndoResult> {
  const row = await loadAction(charityId, id);
  if (!row || !row.undo) return { ok: false, why: "gone", row };
  if (!canUndo(row, now)) return { ok: false, why: row.undone_at ? "gone" : "late", row };
  if (APPLICATION_KINDS.includes(row.kind) && !editable(charityStatus)) return { ok: false, why: "locked", row };
  // Taking an action back needs what doing it needed (team roles, 10/11/2026: src/lib/charity/permissions.ts).
  // Adding existing donors to the journey stays the owner's, as before.
  const needs = row.undo.type === "journey_enrolments" ? "owner" : permissionForAction(row.kind);
  if (!can(await memberRole(charityId, userId), needs)) return { ok: false, why: "owner", row };

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

  // What the undo itself found out, for "what just happened" (how many came off a journey, and how many stayed).
  const extra: Details = {};
  const why = await apply(charityId, row.undo, extra).catch((e) => {
    console.error("[undo]", row.kind, e instanceof Error ? e.message : e);
    return "error" as const;
  });
  if (why) {
    // Nothing changed: let them see the reason, and try again if it was a hiccup.
    await db.from("charity_actions").update({ undone_at: null, undone_by: null }).eq("id", id);
    return { ok: false, why, row };
  }
  await logAudit({ actorUserId: userId, action: "charity.action_undone", entityType: "charity", entityId: charityId, details: { kind: row.kind, actionId: id } });
  // A role put back is a role change like any other, in the audit log too.
  if (row.undo.type === "set_role") {
    await logAudit({ actorUserId: userId, action: "charity.role_changed", entityType: "charity", entityId: charityId, details: { user_id: row.undo.userId, from: row.undo.to, to: row.undo.from, via: "undo" } });
  }
  let details = row.details;
  if (Object.keys(extra).length) {
    details = { ...row.details, ...extra };
    const { error: detailsError } = await db.from("charity_actions").update({ details }).eq("id", id);
    if (detailsError) console.error("[undo] details not saved", detailsError.message);
  }
  return { ok: true, row: { ...row, details, undone_at: now.toISOString() } };
}

/** Bigint columns come back from the database as strings ("1200") but were saved as numbers (1200): both count as the same. */
const plain = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (typeof x === "number" ? String(x) : x));
export const same = (a: unknown, b: unknown) => plain(a) === plain(b);

async function apply(charityId: string, undo: Undo, extra: Details = {}): Promise<UndoFailure | null> {
  const db = createAdminClient();
  const ownPath = (p: string) => p.startsWith(`${charityId}/`) && !p.includes("..");
  switch (undo.type) {
    case "restore": {
      const key = undo.table === "charities" ? "id" : "charity_id";
      const cols = Object.keys(undo.after);
      const { data: now, error } = await db.from(undo.table).select(cols.join(", ")).eq(key, charityId).maybeSingle();
      if (error) throw error;
      if (!now) return "removed";
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
    case "journey": {
      const ref = undo.ref ?? GENERAL;
      const now = await readJourneyState(charityId, ref);
      // Changed again since (by this person or another admin): don't overwrite their newer work.
      if (!same(now, undo.after)) return "changed";
      // Switching back on (taking back "switch off") counts from now: someone who first gave while it was off is an
      // existing donor, added only if the owner chooses, not a new one.
      const back = undo.before.enabled && !now.enabled ? { ...undo.before, switched_on_at: new Date().toISOString() } : undo.before;
      await writeJourney(charityId, null, back, ref);
      return null;
    }
    case "journey_enrolments": {
      if (!undo.ids.length) return "removed";
      const { removed, stayed } = await removeEnrolments(charityId, undo.ids);
      if (!removed) return "emailed";
      extra.removed = removed;
      extra.stayed = stayed;
      return null;
    }
    case "focus": {
      const cols = ["campaign_id", "title", "message", "starts_on", "ends_on"];
      const pick = (r: Record<string, unknown> | null) => (r ? Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) : null);
      const { data: now, error } = await db.from("charity_focus").select(cols.join(", ")).eq("charity_id", charityId).maybeSingle();
      if (error) throw error;
      // Changed again since (by this person or another admin): don't overwrite their newer work.
      if (!same(pick(now as Record<string, unknown> | null), pick(undo.after))) return "changed";
      if (!undo.before) {
        const { error: delError } = await db.from("charity_focus").delete().eq("charity_id", charityId);
        if (delError) throw delError;
        return null;
      }
      const row = { charity_id: charityId, ...pick(undo.before), updated_at: new Date().toISOString() };
      let put = await db.from("charity_focus").upsert(row, { onConflict: "charity_id" });
      // The campaign it pointed at was removed since: it comes back without one.
      if (put.error && /charity_focus_campaign/.test(put.error.message)) put = await db.from("charity_focus").upsert({ ...row, campaign_id: null }, { onConflict: "charity_id" });
      if (put.error) throw put.error;
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
        // Its donor journey (CRM step 6b) keeps its history: a journey anyone is on stops the campaign being removed;
        // an empty one goes with it. Before the journeys had campaigns (20261110000011) there is none.
        const { data: js, error: jErr } = await db.from("charity_journeys").select("id").eq("charity_id", charityId).eq("campaign_id", undo.id);
        if (jErr && !["42703", "PGRST204", "PGRST205", "42P01"].includes(jErr.code ?? "")) throw jErr;
        for (const j of jErr ? [] : (js ?? [])) {
          const { count: people, error: pErr } = await db.from("charity_journey_enrolments").select("id", { count: "exact", head: true }).eq("journey_id", j.id as string);
          if (pErr) throw pErr;
          if ((people ?? 0) > 0) return "journeyed";
          const { error: dErr } = await db.from("charity_journeys").delete().eq("id", j.id as string).eq("charity_id", charityId);
          if (dErr) throw dErr;
        }
      }
      const { data, error } = await db.from(undo.table).delete().eq("id", undo.id).eq("charity_id", charityId).select("id");
      if (error) throw error;
      if (!data?.length) return "removed";
      if (undo.file && ownPath(undo.file.path)) await db.storage.from(undo.file.bucket).remove([undo.file.path]);
      return null;
    }
    case "reinsert": {
      if (undo.row.charity_id !== charityId) return "gone";
      const { error } = await db.from(undo.table).insert(undo.row);
      if (error) {
        if (/up to \d+/.test(error.message)) return "full";
        // Something of the same kind was added since (a newer document of that type): keep it.
        if (/duplicate key/.test(error.message)) return "changed";
        throw error;
      }
      return null;
    }
    case "reopen_campaign": {
      const { data: c, error } = await db.from("campaigns").select("status, ends_at").eq("id", undo.id).eq("charity_id", charityId).maybeSingle();
      if (error) throw error;
      if (!c) return "removed";
      if (c.status !== "ended") return "changed";
      if (c.ends_at && new Date(c.ends_at as string) <= new Date()) return "ended";
      const { error: upError } = await db.from("campaigns").update({ status: "active" }).eq("id", undo.id).eq("charity_id", charityId);
      if (upError) {
        if (/up to 3/.test(upError.message)) return "full";
        throw upError;
      }
      return null;
    }
    case "cancel_receipt_run": {
      const { data, error } = await db
        .from("receipt_runs")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: "The charity took back its approval." })
        .eq("id", undo.id)
        .eq("charity_id", charityId)
        .eq("status", "charity_approved")
        .select("id");
      if (error) throw error;
      // Already signed off and issued (or already withdrawn): receipts can't be taken back here.
      if (!data?.length) return "issued";
      if (undo.decisionIds?.length) await removeDecisions(charityId, undo.decisionIds);
      return null;
    }
    case "receipt_decision": {
      // The list is with Givezy: it can't change until the charity takes its approval back.
      const { data: runs, error: runError } = await db
        .from("receipt_runs").select("id").eq("charity_id", charityId).eq("tax_year", undo.taxYear).in("status", ["charity_approved", "issuing"]);
      if (runError) throw runError;
      if (runs?.length) return "sent";
      let removed: Record<string, unknown> | null = null;
      if (undo.remove) {
        const { data, error } = await db
          .from("receipt_plan_decisions").delete().eq("id", undo.remove.id).eq("charity_id", charityId).eq("decided_at", undo.remove.decidedAt).select("*");
        if (error) throw error;
        // Decided again since (by this person or someone else at the charity): keep the newer decision.
        if (!data?.length) return "changed";
        removed = data[0] as Record<string, unknown>;
      }
      const putBack = async () => {
        if (removed) await db.from("receipt_plan_decisions").insert(removed);
      };
      if (undo.restore?.length) {
        const { error } = await db.rpc("correct_receipt_donor_details", {
          p_charity_id: charityId,
          p_tax_year: undo.taxYear,
          p_rows: undo.restore.map((r) => ({ donation_id: r.donationId, expect: r.after, set: r.before })),
        });
        if (error) {
          await putBack();
          if (/receipt_details_issued/.test(error.message)) return "issued";
          if (/receipt_details_changed/.test(error.message)) return "changed";
          if (/receipt_details_not_found/.test(error.message)) return "removed";
          throw error;
        }
      }
      if (undo.reinsert && undo.reinsert.charity_id === charityId) {
        const { error } = await db.from("receipt_plan_decisions").insert(undo.reinsert);
        if (error) {
          // Decided again since: keep the newer decision.
          if (/duplicate key/.test(error.message)) return "changed";
          throw error;
        }
      }
      return null;
    }
    case "remove_member": {
      const { data, error } = await db.from("charity_admins").delete().eq("charity_id", charityId).eq("user_id", undo.userId).neq("role", "owner").select("user_id");
      if (error) throw error;
      return data?.length ? null : "removed";
    }
    case "set_role": {
      if (!isRole(undo.from) || !isRole(undo.to) || undo.from === "owner") return "gone";
      const { data, error } = await db.from("charity_admins").update({ role: undo.from }).eq("charity_id", charityId).eq("user_id", undo.userId).eq("role", undo.to).select("user_id");
      if (error) throw error;
      return data?.length ? null : "changed";
    }
    case "remove_contacts": {
      if (!/^[0-9a-f-]{36}$/i.test(undo.importId)) return "gone";
      return (await removeContactImport(charityId, undo.importId, null)) ? null : "removed";
    }
    case "remove_recorded": {
      const ids = undo.importId ? null : (undo.donationIds ?? []);
      let q = db.from("donations").select("id, import_id").eq("charity_id", charityId).eq("gateway", "recorded");
      q = undo.importId ? q.eq("import_id", undo.importId) : q.in("id", ids ?? []);
      const { data: rows, error } = await q;
      if (error) throw error;
      const found = (rows ?? []).map((r) => r.id as string);
      if (!found.length) return "removed";
      const { count, error: linkError } = await db.from("s18a_receipt_donations").select("donation_id", { count: "exact", head: true }).in("donation_id", found);
      if (linkError) throw linkError;
      if ((count ?? 0) > 0) return "issued";
      const { error: delError } = await db.from("donations").delete().in("id", found).eq("gateway", "recorded");
      if (delError) {
        if (/cannot be deleted/.test(delError.message)) return "issued";
        throw delError;
      }
      await dropEmptyImports(charityId, [...new Set((rows ?? []).map((r) => r.import_id as string | null).filter((x): x is string => Boolean(x)))]);
      return null;
    }
  }
}

/** Why something couldn't be taken back, in plain words. */
export function undoFailureText(why: UndoFailure): string {
  switch (why) {
    case "gone": return "It has already been taken back.";
    case "removed": return "It was removed since, so there is nothing to take back.";
    case "late": return "It's been more than 30 minutes, so it can't be taken back here. You can change it again by hand.";
    case "changed": return "It was changed again since, so it can't be taken back here. Your newer changes are kept.";
    case "given": return "Donors have already given to it, so it can't be removed. You can end it instead.";
    case "journeyed": return "Donors are on its journey, so it can't be removed and their emails are kept. You can end it instead.";
    case "full": return "There's no room for it: you're at the limit. Remove or end one first, then try again.";
    case "locked": return "Your application has been submitted, so your details are locked while we review them.";
    case "owner": return "Your role doesn't include taking this back. Nothing was changed. Ask your charity's owner, or someone whose role includes it.";
    case "ended": return "Its last day has passed, so it can't run again. Start a new campaign instead.";
    case "issued": return "It's already on an s18A receipt Givezy has issued, so it can't be taken back here. If something is wrong, tell us: only we can withdraw and re-issue a receipt.";
    case "sent": return "Your list of s18A receipts is with Givezy now, so it can't change. Take back your approval first (s18A receipts), then try again.";
    case "emailed": return "They have had their first journey email already, so they stay on it. You can switch the journey off instead.";
    case "error": return "Something went wrong and nothing was changed. Please try again.";
  }
}
