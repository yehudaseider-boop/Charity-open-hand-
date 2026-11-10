import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JourneyStep } from "./journey";

/**
 * The donor journey's two writes that Undo also needs (CRM step 6a): put the journey back as it was, and take off
 * donors added by "Add my existing donors". Kept apart from journey-store so the dashboard's undo can use them without
 * importing the sending side. Service role: call only after checking the person manages the charity.
 */

const db = () => createAdminClient();

/** What Undo puts back: the switch and the emails. */
export type JourneyState = { enabled: boolean; switched_on_at: string | null; steps: JourneyStep[] };

/**
 * Put the journey as given: the switch and exactly these emails, in one database transaction
 * (save_charity_journey), so the daily run never sees half a save.
 */
export async function writeJourney(charityId: string, userId: string | null, state: JourneyState): Promise<void> {
  const { error } = await db().rpc("save_charity_journey", {
    p_charity_id: charityId,
    p_enabled: state.enabled && state.steps.length > 0,
    p_switched_on_at: state.switched_on_at,
    p_steps: state.steps.map((s) => ({ subject: s.subject, body: s.body, waitDays: s.waitDays })),
    p_user: userId,
  });
  if (error) throw error;
}

/**
 * Undo for "Add my existing donors": takes off the ones added that haven't had an email (not even one being sent), in
 * one locked statement (remove_journey_enrolments), so the daily run can't start one in between. Says how many came
 * off and how many stay.
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

/** The journey as it stands now, in Undo's shape. */
export async function readJourneyState(charityId: string): Promise<JourneyState> {
  const [j, s] = await Promise.all([
    db().from("charity_journeys").select("enabled, switched_on_at").eq("charity_id", charityId).maybeSingle(),
    db().from("charity_journey_steps").select("subject, body, wait_days").eq("charity_id", charityId).order("position"),
  ]);
  if (j.error) throw j.error;
  if (s.error) throw s.error;
  return {
    enabled: Boolean(j.data?.enabled),
    switched_on_at: (j.data?.switched_on_at as string | null) ?? null,
    steps: (s.data ?? []).map((r) => ({ subject: r.subject as string, body: r.body as string, waitDays: Number(r.wait_days) })),
  };
}
