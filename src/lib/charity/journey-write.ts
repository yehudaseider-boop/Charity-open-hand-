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

/** Put the journey as given: the switch and exactly these emails (more are removed). */
export async function writeJourney(charityId: string, userId: string | null, state: JourneyState): Promise<void> {
  const now = new Date().toISOString();
  const up = await db()
    .from("charity_journeys")
    .upsert({ charity_id: charityId, enabled: state.enabled && state.steps.length > 0, switched_on_at: state.switched_on_at, updated_at: now, updated_by: userId }, { onConflict: "charity_id" });
  if (up.error) throw up.error;
  const del = await db().from("charity_journey_steps").delete().eq("charity_id", charityId).gt("position", state.steps.length);
  if (del.error) throw del.error;
  if (state.steps.length) {
    const rows = state.steps.map((s, i) => ({ charity_id: charityId, position: i + 1, subject: s.subject, body: s.body, wait_days: s.waitDays, updated_at: now }));
    const put = await db().from("charity_journey_steps").upsert(rows, { onConflict: "charity_id,position" });
    if (put.error) throw put.error;
  }
}

/** Undo for "Add my existing donors": takes off the ones added that haven't had an email yet. */
export async function removeEnrolments(charityId: string, ids: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const sent = await db().from("charity_journey_sends").select("enrolment_id").in("enrolment_id", chunk);
    if (sent.error) throw sent.error;
    const had = new Set((sent.data ?? []).map((r) => r.enrolment_id as string));
    const go = chunk.filter((id) => !had.has(id));
    if (!go.length) continue;
    const { data, error } = await db().from("charity_journey_enrolments").delete().eq("charity_id", charityId).in("id", go).select("id");
    if (error) throw error;
    removed += data?.length ?? 0;
  }
  return removed;
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
