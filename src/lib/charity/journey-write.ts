import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "./video";
import { GENERAL, type JourneyKind, type JourneyRef, type JourneyStep } from "./journey";

/**
 * The donor journeys' writes that Undo also needs (CRM steps 6a, 6b and 7): put a journey back as it was, and take off
 * donors added by "Add my existing donors" or "Add to win-back journey". Kept apart from journey-store so the
 * dashboard's undo can use them without importing the sending side. Service role: call only after checking the person
 * manages the charity.
 *
 * Campaign and win-back journeys need migration 20261110000011 (each journey its own id and kind). Until it has run, a
 * charity has only its general journey, keyed by the charity, exactly as before: `journeysV2()` says which.
 */

const db = () => createAdminClient();

/** What Undo puts back: the switch and the emails. */
export type JourneyState = { enabled: boolean; switched_on_at: string | null; steps: JourneyStep[] };

let v2Cache: { at: number; v2: boolean } | null = null;

/** Has migration 20261110000011 run (journeys with their own id and kind)? Checked at most once a minute until it has. */
export async function journeysV2(): Promise<boolean> {
  if (v2Cache && (v2Cache.v2 || Date.now() - v2Cache.at < 60_000)) return v2Cache.v2;
  const { error } = await db().from("charity_journeys").select("id, kind, campaign_id").limit(1);
  if (error && !isMissingColumn(error) && error.code !== "PGRST205" && error.code !== "42P01") throw error;
  v2Cache = { at: Date.now(), v2: !error };
  return v2Cache.v2;
}

/** For tests: forget what was found. */
export function forgetJourneysV2(): void {
  v2Cache = null;
}

/** A journey's row: its id (null before the migration, when the charity's journey is keyed by the charity) and switch. */
export type JourneyRow = { id: string | null; kind: JourneyKind; campaignId: string | null; enabled: boolean; switchedOnAt: string | null; updatedAt: string | null };

/** The charity's journey of this kind, or null when it has none yet. */
export async function findJourney(charityId: string, ref: JourneyRef = GENERAL): Promise<JourneyRow | null> {
  if (!(await journeysV2())) {
    if (ref.kind !== "general") return null;
    const { data, error } = await db().from("charity_journeys").select("enabled, switched_on_at, updated_at").eq("charity_id", charityId).maybeSingle();
    if (error) throw error;
    return data ? { id: null, kind: "general", campaignId: null, enabled: Boolean(data.enabled), switchedOnAt: (data.switched_on_at as string | null) ?? null, updatedAt: (data.updated_at as string | null) ?? null } : null;
  }
  let q = db().from("charity_journeys").select("id, kind, campaign_id, enabled, switched_on_at, updated_at").eq("charity_id", charityId).eq("kind", ref.kind);
  if (ref.kind === "campaign") q = q.eq("campaign_id", ref.campaignId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? rowOf(data) : null;
}

export function rowOf(d: Record<string, unknown>): JourneyRow {
  return {
    id: (d.id as string | null) ?? null,
    kind: ((d.kind as JourneyKind | undefined) ?? "general"),
    campaignId: (d.campaign_id as string | null) ?? null,
    enabled: Boolean(d.enabled),
    switchedOnAt: (d.switched_on_at as string | null) ?? null,
    updatedAt: (d.updated_at as string | null) ?? null,
  };
}

/** A journey's emails, in order. */
export async function journeySteps(charityId: string, row: Pick<JourneyRow, "id"> | null): Promise<JourneyStep[]> {
  if (!row) return [];
  const q = db().from("charity_journey_steps").select("position, subject, body, wait_days");
  const { data, error } = await (row.id ? q.eq("journey_id", row.id) : q.eq("charity_id", charityId)).order("position");
  if (error) throw error;
  return (data ?? []).map((r) => ({ subject: r.subject as string, body: r.body as string, waitDays: Number(r.wait_days) }));
}

/**
 * Put the journey as given: the switch and exactly these emails, in one database transaction (save_charity_journey for
 * the general journey, save_journey for the others), so the daily run never sees half a save.
 */
export async function writeJourney(charityId: string, userId: string | null, state: JourneyState, ref: JourneyRef = GENERAL): Promise<void> {
  const steps = state.steps.map((s) => ({ subject: s.subject, body: s.body, waitDays: s.waitDays }));
  const enabled = state.enabled && state.steps.length > 0;
  if (ref.kind === "general") {
    const { error } = await db().rpc("save_charity_journey", { p_charity_id: charityId, p_enabled: enabled, p_switched_on_at: state.switched_on_at, p_steps: steps, p_user: userId });
    if (error) throw error;
    return;
  }
  if (!(await journeysV2())) throw new Error("journeys_not_set_up");
  const { error } = await db().rpc("save_journey", {
    p_charity_id: charityId,
    p_kind: ref.kind,
    p_campaign_id: ref.kind === "campaign" ? ref.campaignId : null,
    p_enabled: enabled,
    p_switched_on_at: state.switched_on_at,
    p_steps: steps,
    p_user: userId,
  });
  if (error) throw error;
}

/**
 * Undo for adding donors to a journey: takes off the ones added that haven't had an email (not even one being sent),
 * in one locked statement (remove_journey_enrolments), so the daily run can't start one in between. Says how many came
 * off and how many stay. Works for every journey (by enrolment id, always within the charity).
 */
export async function removeEnrolments(charityId: string, ids: string[]): Promise<{ removed: number; stayed: number }> {
  let removed = 0;
  let stayed = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const { data, error } = await db().rpc("remove_journey_enrolments", { p_charity_id: charityId, p_ids: ids.slice(i, i + 1000) });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { removed: number; stayed: number } | null;
    removed += Number(row?.removed ?? 0);
    stayed += Number(row?.stayed ?? 0);
  }
  return { removed, stayed };
}

/** The journey as it stands now, in Undo's shape. A journey not made yet is off with no emails. */
export async function readJourneyState(charityId: string, ref: JourneyRef = GENERAL): Promise<JourneyState> {
  const row = await findJourney(charityId, ref);
  return { enabled: Boolean(row?.enabled), switched_on_at: row?.switchedOnAt ?? null, steps: await journeySteps(charityId, row) };
}
