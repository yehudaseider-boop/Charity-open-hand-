import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { EmailError, getEmailTransport } from "@/lib/email";
import { oneClickStopUrl } from "@/lib/email/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  JOURNEY_ENROL_CAP,
  JOURNEY_MIN_SHARE,
  JOURNEY_RUN_CAP,
  SEND_TIMEOUT_MS,
  afterFailure,
  afterSend,
  existingSendAction,
  fairShares,
  gaveAgain,
  GENERAL,
  WINBACK,
  refKey,
  type JourneyKind,
  type JourneyRef,
  charityPageUrl,
  claimNote,
  decideDue,
  firstDue,
  journeyEmail,
  newJoiners,
  nextWeekStart,
  planExisting,
  planWinback,
  type ExistingSkip,
  type JourneyStep,
} from "./journey";
import { findJourney, journeySteps, journeysV2, rowOf, type JourneyRow, type JourneyState } from "./journey-write";
import { contacts, optedOutHashes } from "./s18a-reminder-send";
import { emailHash, weekStart } from "./thank-you";
import { messagedThisWeek } from "./weekly-limit";

/**
 * The donor journey's database side (CRM step 6a, 10/11/2026). The tables are server-only: every call here comes after
 * the caller checked the signed-in person manages the charity (loadCharityForManager, and isOwner for changes), or
 * from the daily job. Reads and writes with the service role, always filtered by the charity.
 */

const db = () => createAdminClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** The kind of message stored in the weekly claim (charity_donor_thanks.kind). */
export const JOURNEY_KIND = "journey";

export type Journey = {
  /** Null before migration 20261110000011, when the charity's one journey is keyed by the charity. */
  id: string | null;
  kind: JourneyKind;
  campaignId: string | null;
  enabled: boolean;
  switchedOnAt: string | null;
  updatedAt: string | null;
  steps: JourneyStep[];
};
export type { JourneyState } from "./journey-write";
export { readJourneyState, removeEnrolments, writeJourney, journeysV2 } from "./journey-write";

/** The charity's journey of this kind: off with no emails when it hasn't been made yet. */
export async function loadJourney(charityId: string, ref: JourneyRef = GENERAL): Promise<Journey> {
  const row = await findJourney(charityId, ref);
  return fromRow(row ?? { id: null, kind: ref.kind, campaignId: ref.kind === "campaign" ? ref.campaignId : null, enabled: false, switchedOnAt: null, updatedAt: null }, await journeySteps(charityId, row));
}

function fromRow(r: JourneyRow, steps: JourneyStep[]): Journey {
  return { id: r.id, kind: r.kind, campaignId: r.campaignId, enabled: r.enabled, switchedOnAt: r.switchedOnAt, updatedAt: r.updatedAt, steps };
}

export type JourneySummary = { ref: JourneyRef; kind: JourneyKind; campaignId: string | null; enabled: boolean; switchedOnAt: string | null; stepCount: number };

/** Every journey the charity has made (the general one first, then win-back, then campaigns'). */
export async function listJourneys(charityId: string): Promise<JourneySummary[]> {
  if (!(await journeysV2())) {
    const j = await loadJourney(charityId);
    return j.switchedOnAt || j.steps.length ? [{ ref: GENERAL, kind: "general", campaignId: null, enabled: j.enabled, switchedOnAt: j.switchedOnAt, stepCount: j.steps.length }] : [];
  }
  const [js, st] = await Promise.all([
    db().from("charity_journeys").select("id, kind, campaign_id, enabled, switched_on_at, updated_at").eq("charity_id", charityId),
    db().from("charity_journey_steps").select("journey_id").eq("charity_id", charityId),
  ]);
  if (js.error) throw js.error;
  if (st.error) throw st.error;
  const count = new Map<string, number>();
  for (const r of st.data ?? []) count.set(r.journey_id as string, (count.get(r.journey_id as string) ?? 0) + 1);
  const order: Record<JourneyKind, number> = { general: 0, winback: 1, campaign: 2 };
  return (js.data ?? [])
    .map((d) => rowOf(d))
    .map((r) => ({
      ref: (r.kind === "campaign" ? { kind: "campaign", campaignId: r.campaignId! } : r.kind === "winback" ? WINBACK : GENERAL) as JourneyRef,
      kind: r.kind,
      campaignId: r.campaignId,
      enabled: r.enabled,
      switchedOnAt: r.switchedOnAt,
      stepCount: count.get(r.id!) ?? 0,
    }))
    .sort((a, b) => order[a.kind] - order[b.kind] || refKey(a.ref).localeCompare(refKey(b.ref)));
}

/** Only this journey's rows: by its id, or by the charity before the migration. */
function scoped<Q>(q: Q, charityId: string, j: Pick<Journey, "id">): Q {
  type Eq = { eq: (col: string, v: string) => Eq };
  const by = (q as unknown as Eq).eq("charity_id", charityId);
  return (j.id ? by.eq("journey_id", j.id) : by) as unknown as Q;
}

export function stateOf(j: Journey): JourneyState {
  return { enabled: j.enabled, switched_on_at: j.switchedOnAt, steps: j.steps };
}


/** Where everyone on the journey is: status and next email, for the counts. */
export async function enrolmentStates(charityId: string, j: Pick<Journey, "id">): Promise<{ status: string; next_step: number }[]> {
  const out: { status: string; next_step: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await scoped(db().from("charity_journey_enrolments").select("status, next_step"), charityId, j).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as { status: string; next_step: number }[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type JourneyPerson = { id: string; donorId: string; name: string; source: string; status: string; next_step: number; next_due_at: string; stopped_reason: string | null; enrolled_at: string };

/** The most recently moved people on the journey, with their names from their latest paid gift. */
export async function journeyPeople(charityId: string, j: Pick<Journey, "id">, limit = 50): Promise<JourneyPerson[]> {
  const { data, error } = await scoped(db().from("charity_journey_enrolments").select("id, donor_id, source, status, next_step, next_due_at, stopped_reason, enrolled_at"), charityId, j)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const names = await donorNames(charityId, rows.map((r) => r.donor_id as string));
  return rows.map((r) => ({
    id: r.id as string,
    donorId: r.donor_id as string,
    name: names.get(r.donor_id as string) ?? "A donor",
    source: r.source as string,
    status: r.status as string,
    next_step: Number(r.next_step),
    next_due_at: r.next_due_at as string,
    stopped_reason: (r.stopped_reason as string | null) ?? null,
    enrolled_at: r.enrolled_at as string,
  }));
}

/** Each donor's name as typed at their latest paid gift to this charity. Never for an erased donor. */
async function donorNames(charityId: string, donorIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < donorIds.length; i += 200) {
    const { data, error } = await db()
      .from("donations")
      .select("donor_id, paid_at, donation_checkout_details(donor_type, first_name, last_name, organisation_name, erased_at)")
      .eq("charity_id", charityId)
      .eq("status", "paid")
      .in("donor_id", donorIds.slice(i, i + 200))
      .order("paid_at", { ascending: false });
    if (error) throw error;
    for (const g of data ?? []) {
      const id = g.donor_id as string;
      if (out.has(id)) continue;
      const raw = g.donation_checkout_details as unknown;
      const d = (Array.isArray(raw) ? raw[0] : raw) as { donor_type: string; first_name: string | null; last_name: string | null; organisation_name: string | null; erased_at: string | null } | null;
      if (!d || d.erased_at) {
        out.set(id, "A donor (details erased)");
        continue;
      }
      const name = d.donor_type === "individual" ? `${d.first_name ?? ""} ${d.last_name ?? ""}` : (d.organisation_name ?? "");
      out.set(id, name.replace(/\s+/g, " ").trim() || "A donor");
    }
  }
  return out;
}

/**
 * Every donor with a paid gift to this charity (on Givezy or recorded by the charity), paid before `before` when given:
 * someone whose first gift came after the journey was switched on joins as a new donor instead.
 */
async function allDonorIds(charityId: string, before?: string): Promise<string[]> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    let q = db().from("donations").select("donor_id").eq("charity_id", charityId).eq("status", "paid").not("donor_id", "is", null);
    if (before) q = q.lt("paid_at", before);
    const { data, error } = await q.order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) ids.add(r.donor_id as string);
    if (!data || data.length < 1000) break;
  }
  return [...ids];
}

async function enrolledDonors(charityId: string, j: Pick<Journey, "id">, donorIds?: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (donorIds) {
    for (let i = 0; i < donorIds.length; i += 200) {
      const { data, error } = await scoped(db().from("charity_journey_enrolments").select("donor_id"), charityId, j).in("donor_id", donorIds.slice(i, i + 200));
      if (error) throw error;
      for (const r of data ?? []) out.add(r.donor_id as string);
    }
    return out;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await scoped(db().from("charity_journey_enrolments").select("donor_id"), charityId, j).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.donor_id as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * "Add my existing donors": who would join, and why the others wouldn't. Only donors who first gave before the journey
 * was switched on (`switchedOnAt`): anyone later joins on their own as a new donor. Counts only leave this file.
 */
export async function planExistingDonors(charityId: string, journey: Pick<Journey, "id" | "switchedOnAt">) {
  const ids = await allDonorIds(charityId, journey.switchedOnAt ?? undefined);
  const [who, already] = await Promise.all([contacts(charityId, ids), enrolledDonors(charityId, journey)]);
  const hashes = [...who.byDonor.values()].map((c) => emailHash(c.email));
  const stopped = await optedOutHashes(charityId, hashes);
  return planExisting(
    ids.map((id) => {
      const c = who.byDonor.get(id) ?? null;
      return { donorId: id, already: already.has(id), erased: who.erased.has(id), email: c?.email ?? null, optedOut: c ? stopped.has(emailHash(c.email)) : false };
    }),
  );
}

/** Adds them. Returns the new enrolments' ids (for Undo) and the counts. A donor already on it is never added twice. */
export async function addExistingDonors(charityId: string, now = new Date()): Promise<{ ids: string[]; skipped: Record<ExistingSkip, number>; firstDue: string | null }> {
  const journey = await loadJourney(charityId);
  if (!journey.steps.length || !journey.switchedOnAt) return { ids: [], skipped: { already: 0, erased: 0, opted_out: 0, recorded_only: 0 }, firstDue: null };
  const plan = await planExistingDonors(charityId, journey);
  const due = firstDue(now, journey.steps).toISOString();
  const ids = await insertEnrolments(charityId, journey, plan.add.map((c) => c.donorId), "existing", now, due);
  // Someone added at the same moment by another press or the daily job: counted as already on it.
  plan.skipped.already += plan.add.length - ids.length;
  return { ids, skipped: plan.skipped, firstDue: due };
}

/** Puts donors on a journey (never twice): the new enrolments' ids. */
async function insertEnrolments(charityId: string, j: Pick<Journey, "id">, donorIds: string[], source: "existing" | "winback", now: Date, due: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < donorIds.length; i += 500) {
    const rows = donorIds.slice(i, i + 500).map((donorId) => ({ charity_id: charityId, ...(j.id ? { journey_id: j.id } : {}), donor_id: donorId, source, enrolled_at: now.toISOString(), next_step: 1, next_due_at: due }));
    const { data, error } = await db().from("charity_journey_enrolments").upsert(rows, { onConflict: j.id ? "journey_id,donor_id" : "charity_id,donor_id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    for (const r of data ?? []) ids.push(r.id as string);
  }
  return ids;
}

/**
 * "Add to win-back journey" (CRM step 7): of the chosen donors, who would join and why the others wouldn't. Only this
 * charity's own donors count (a paid gift to it); anyone else is left out without a word, as if never chosen.
 */
export async function planWinbackDonors(charityId: string, donorIds: string[]) {
  const journey = await loadJourney(charityId, WINBACK);
  const who = await contacts(charityId, donorIds);
  const mine = donorIds.filter((id) => who.found.has(id));
  const already = await enrolledDonors(charityId, journey, mine);
  const hashes = [...who.byDonor.values()].map((c) => emailHash(c.email));
  const stopped = await optedOutHashes(charityId, hashes);
  return {
    journey,
    plan: planWinback(
      mine.map((id) => {
        const c = who.byDonor.get(id) ?? null;
        return { donorId: id, already: journey.id ? already.has(id) : false, erased: who.erased.has(id), email: c?.email ?? null, optedOut: c ? stopped.has(emailHash(c.email)) : false };
      }),
    ),
  };
}

/** Adds them to the win-back journey (it must be on). Returns the new enrolments' ids (for Undo) and the counts. */
export async function addWinbackDonors(charityId: string, donorIds: string[], now = new Date()): Promise<{ ids: string[]; skipped: Record<ExistingSkip, number>; firstDue: string | null }> {
  const { journey, plan } = await planWinbackDonors(charityId, donorIds);
  if (!journey.id || !journey.enabled || !journey.steps.length) return { ids: [], skipped: plan.skipped, firstDue: null };
  const due = firstDue(now, journey.steps).toISOString();
  const ids = await insertEnrolments(charityId, journey, plan.add.map((c) => c.donorId), "winback", now, due);
  plan.skipped.already += plan.add.length - ids.length;
  return { ids, skipped: plan.skipped, firstDue: due };
}

export type JourneyRun = {
  enrolled: number;
  sent: number;
  waiting: number;
  stopped: number;
  finished: number;
  failed: number;
  unknown: number;
  leftOver: number;
  emailOff: boolean;
  /** The journey's tables aren't there yet (its migration hasn't run): nothing to do, nothing to report. */
  notSetUp?: boolean;
};

/** The table isn't there (PostgREST's "not in the schema cache", or Postgres's "no such table"). */
export const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";

/** Did a send that threw maybe go? A refusal from the email service didn't; a time-out or a broken connection may have. */
function failedForSure(e: unknown): boolean {
  return e instanceof EmailError;
}

type Live = { charityId: string; id: string | null; kind: JourneyKind; campaignId: string | null; switchedOnAt: Date; name: string; slug: string; steps: JourneyStep[] };
type DueRow = { id: string; charity_id: string; journey_id?: string | null; donor_id: string; next_step: number; attempts: number };

/**
 * The daily job's part (after collections, checks and the alert to Givezy): add new donors to switched-on journeys,
 * then send the emails that are due, shared fairly between charities, up to JOURNEY_RUN_CAP, and none started after
 * the deadline; the rest go the next day. With email not switched on, nothing is sent and nothing is marked sent.
 *
 * Each email: its log row is written first ("sending"), then the donor's week is claimed, then it is sent with a time
 * limit. Sent: the log says so and the donor moves to the next email. Refused or not allowed: the log row and the week
 * are handed back, and the email is tried again later (1, 3, 7 days), then the donor stops. Cut off or a broken
 * connection: it may have gone, so the row stays "sending", and a later run marks it unknown and moves on without
 * sending it again.
 */
export async function runJourneys(now: Date, deadline: number): Promise<JourneyRun> {
  const out: JourneyRun = { enrolled: 0, sent: 0, waiting: 0, stopped: 0, finished: 0, failed: 0, unknown: 0, leftOver: 0, emailOff: false };
  // Before migration 20261110000011 the journeys have no id or kind: then each charity has its general one only.
  const v2 = await journeysV2().catch(() => false);
  const { data: journeys, error } = await db()
    .from("charity_journeys")
    .select(v2 ? "id, kind, campaign_id, charity_id, switched_on_at, charities(status, name_en, slug)" : "charity_id, switched_on_at, charities(status, name_en, slug)")
    .eq("enabled", true);
  if (isMissingTable(error)) return { ...out, notSetUp: true };
  if (error) throw error;
  const live: Live[] = [];
  for (const j of (journeys ?? []) as unknown as Record<string, unknown>[]) {
    const raw = j.charities as unknown;
    const c = (Array.isArray(raw) ? raw[0] : raw) as { status: string; name_en: string; slug: string } | null;
    // Only a charity whose page is live sends anything.
    if (!c || c.status !== "approved" || !j.switched_on_at) continue;
    const row = rowOf(j);
    const steps = await journeySteps(j.charity_id as string, row);
    if (steps.length) live.push({ charityId: j.charity_id as string, id: row.id, kind: row.kind, campaignId: row.campaignId, switchedOnAt: new Date(j.switched_on_at as string), name: c.name_en, slug: c.slug, steps });
  }
  // Win-back donors who have given again leave it before anything is sent.
  out.stopped += await stopGaveAgain(live.filter((j) => j.kind === "winback"), now, deadline);
  out.enrolled = await enrolNewDonors(live, now, deadline);

  const transport = getEmailTransport();
  if (transport.name === "console") return { ...out, emailOff: true };
  if (!live.length || Date.now() >= deadline) return out;

  // Each charity's due list across its journeys (up to the whole cap), then a fair share of the cap for each charity.
  const byCharity = new Map<string, Live[]>();
  for (const j of live) byCharity.set(j.charityId, [...(byCharity.get(j.charityId) ?? []), j]);
  const dueBy = new Map<string, DueRow[]>();
  for (const [charityId, js] of byCharity) {
    const ids = js.map((j) => j.id).filter((x): x is string => Boolean(x));
    let q = db()
      .from("charity_journey_enrolments")
      .select(ids.length ? "id, charity_id, journey_id, donor_id, next_step, attempts" : "id, charity_id, donor_id, next_step, attempts")
      .eq("charity_id", charityId)
      .eq("status", "active")
      .lte("next_due_at", now.toISOString());
    if (ids.length) q = q.in("journey_id", ids);
    const { data, error: e } = await q.order("next_due_at").limit(JOURNEY_RUN_CAP + 1);
    if (e) throw e;
    if (data?.length) dueBy.set(charityId, data as unknown as DueRow[]);
  }
  const shares = fairShares(new Map([...dueBy].map(([k, v]) => [k, v.length])), Math.max(JOURNEY_RUN_CAP, JOURNEY_MIN_SHARE * dueBy.size));
  for (const [charityId, all] of dueBy) {
    const list = all.slice(0, shares.get(charityId) ?? 0);
    out.leftOver += all.length - list.length;
    if (Date.now() >= deadline) {
      out.leftOver += list.length;
      continue;
    }
    await sendDue(byCharity.get(charityId)!, list, transport, now, deadline, out);
  }
  return out;
}

/**
 * Win-back donors who gave again (any gift that went through, after they were added) leave the win-back journey
 * ('gave_again'). Returns how many.
 */
async function stopGaveAgain(winbacks: Live[], now: Date, deadline: number): Promise<number> {
  let stopped = 0;
  for (const j of winbacks) {
    if (!j.id || Date.now() >= deadline) continue;
    const { data: rows, error } = await db().from("charity_journey_enrolments").select("id, donor_id, enrolled_at").eq("charity_id", j.charityId).eq("journey_id", j.id).eq("status", "active").limit(2000);
    if (error) throw error;
    const enrolled = new Map((rows ?? []).map((r) => [r.donor_id as string, { id: r.id as string, at: new Date(r.enrolled_at as string) }]));
    const ids = [...enrolled.keys()];
    const last = new Map<string, Date>();
    for (let i = 0; i < ids.length; i += 200) {
      const earliest = new Date(Math.min(...ids.slice(i, i + 200).map((id) => enrolled.get(id)!.at.getTime()))).toISOString();
      const { data, error: e } = await db().from("donations").select("donor_id, paid_at").eq("charity_id", j.charityId).eq("status", "paid").in("donor_id", ids.slice(i, i + 200)).gt("paid_at", earliest);
      if (e) throw e;
      for (const g of data ?? []) {
        const at = new Date(g.paid_at as string);
        const had = last.get(g.donor_id as string);
        if (!had || at > had) last.set(g.donor_id as string, at);
      }
    }
    for (const [donorId, e] of enrolled) {
      if (!gaveAgain(e.at, last.get(donorId) ?? null)) continue;
      const { error: u } = await db().from("charity_journey_enrolments").update({ status: "stopped", stopped_reason: "gave_again", updated_at: now.toISOString() }).eq("id", e.id).eq("status", "active");
      if (u) throw u;
      stopped++;
    }
  }
  return stopped;
}

/** New donors: first paid gift on Givezy while the journey was on, not erased. Looks back 35 days, enough for a missed day. */
async function enrolNewDonors(live: Live[], now: Date, deadline: number): Promise<number> {
  let room = JOURNEY_ENROL_CAP;
  let enrolled = 0;
  // The win-back journey has no automatic joiners: the owner adds them.
  for (const j of live.filter((x) => x.kind !== "winback")) {
    if (room <= 0 || Date.now() >= deadline) break;
    const since = new Date(Math.max(j.switchedOnAt.getTime(), now.getTime() - 35 * 86_400_000)).toISOString();
    const first = new Map<string, Date>();
    for (let from = 0; from < 5000; from += 1000) {
      let q = db()
        .from("donations")
        .select("donor_id, paid_at")
        .eq("charity_id", j.charityId)
        .eq("status", "paid")
        .neq("gateway", "recorded")
        .not("donor_id", "is", null)
        .gte("paid_at", since);
      // A campaign's journey: gifts to that campaign only.
      if (j.kind === "campaign" && j.campaignId) q = q.eq("campaign_id", j.campaignId);
      const { data, error: e } = await q.order("paid_at").range(from, from + 999);
      if (e) throw e;
      for (const r of data ?? []) if (!first.has(r.donor_id as string)) first.set(r.donor_id as string, new Date(r.paid_at as string));
      if (!data || data.length < 1000) break;
    }
    if (!first.size) continue;
    const ids = [...first.keys()];
    // A gift before the switch (or a recorded one) means they were already a donor: "Add my existing donors" covers them.
    // For a campaign's journey, a gift to that campaign before the switch: donors who gave to it before aren't added.
    const earlier = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      let q = db()
        .from("donations")
        .select("donor_id")
        .eq("charity_id", j.charityId)
        .in("status", ["paid", "refunded", "charged_back"])
        .in("donor_id", ids.slice(i, i + 200))
        .lt("paid_at", j.switchedOnAt.toISOString());
      if (j.kind === "campaign" && j.campaignId) q = q.eq("campaign_id", j.campaignId);
      const { data, error: e } = await q;
      if (e) throw e;
      for (const r of data ?? []) earlier.add(r.donor_id as string);
    }
    for (const id of earlier) first.delete(id);
    if (!first.size) continue;
    // Erased donors (their gifts stay, without their details) never join, even within the look-back.
    const who = await contacts(j.charityId, [...first.keys()]);
    for (const id of who.erased) first.delete(id);
    const joiners = newJoiners(first, j.switchedOnAt, await enrolledDonors(j.charityId, j, [...first.keys()])).slice(0, room);
    if (!joiners.length) continue;
    const rows = joiners.map((n) => ({ charity_id: j.charityId, ...(j.id ? { journey_id: j.id } : {}), donor_id: n.donorId, source: "new_gift", enrolled_at: n.joined.toISOString(), next_step: 1, next_due_at: firstDue(n.joined, j.steps).toISOString() }));
    const { data, error: e } = await db().from("charity_journey_enrolments").upsert(rows, { onConflict: j.id ? "journey_id,donor_id" : "charity_id,donor_id", ignoreDuplicates: true }).select("id");
    if (e) throw e;
    enrolled += data?.length ?? 0;
    room -= data?.length ?? 0;
  }
  return enrolled;
}

async function sendDue(js: Live[], list: DueRow[], transport: ReturnType<typeof getEmailTransport>, now: Date, deadline: number, out: JourneyRun): Promise<void> {
  const j0 = js[0];
  const charityId = j0.charityId;
  // Each row's own journey (before the migration, the charity's one journey).
  const journeyOf = (r: DueRow) => js.find((x) => (x.id ?? null) === (r.journey_id ?? null)) ?? (r.journey_id ? null : j0);
  const donorIds = list.map((r) => r.donor_id);
  const [who, priv] = await Promise.all([contacts(charityId, donorIds), db().from("charity_private").select("contact_email").eq("charity_id", charityId).maybeSingle()]);
  const replyTo = (priv.data?.contact_email as string | null) ?? null;
  const withEmail = donorIds.flatMap((id) => {
    const c = who.byDonor.get(id);
    return c ? [{ donorId: id, hash: emailHash(c.email) }] : [];
  });
  const [stopped, recent] = await Promise.all([optedOutHashes(charityId, withEmail.map((d) => d.hash)), messagedThisWeek(charityId, withEmail, now)]);
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const week = weekStart(now);
  const update = (id: string, set: Record<string, unknown>) => db().from("charity_journey_enrolments").update({ ...set, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "active");

  for (let at = 0; at < list.length; at++) {
    const r = list[at];
    // No new email starts after the deadline: the rest go the next day.
    if (Date.now() >= deadline) {
      out.leftOver += list.length - at;
      return;
    }
    const j = journeyOf(r);
    // Its journey was switched off or emptied since the list was read: it waits.
    if (!j) continue;
    const contact = who.byDonor.get(r.donor_id) ?? null;
    const decision = decideDue(
      { hasGift: who.found.has(r.donor_id), erased: who.erased.has(r.donor_id), email: contact?.email ?? null, optedOut: contact ? stopped.has(emailHash(contact.email)) : false, messagedThisWeek: recent.has(r.donor_id), nextStep: r.next_step },
      j.steps.length,
    );
    if (decision.kind === "stop") {
      await update(r.id, { status: "stopped", stopped_reason: decision.reason });
      out.stopped++;
      continue;
    }
    if (decision.kind === "finish") {
      await update(r.id, { status: "finished", next_step: Math.min(6, j.steps.length + 1) });
      out.finished++;
      continue;
    }
    if (decision.kind === "wait_week") {
      await update(r.id, { next_due_at: nextWeekStart(now).toISOString() });
      out.waiting++;
      continue;
    }
    const position = r.next_step;
    const step = j.steps[position - 1];
    const advance = () => {
      const next = afterSend(position, new Date(), j.steps);
      return update(r.id, next ? { next_step: next.nextStep, next_due_at: next.due.toISOString(), attempts: 0 } : { status: "finished", next_step: position + 1, attempts: 0 });
    };
    // 1. The log row first: an email is never sent twice.
    const logged = await db().from("charity_journey_sends").insert({ enrolment_id: r.id, charity_id: charityId, position, status: "sending" }).select("id").single();
    if (logged.error) {
      // Taken off the journey a moment ago (Undo of "Add my existing donors"): nothing to send.
      if (logged.error.code === "23503") continue;
      if (logged.error.code !== "23505") throw logged.error;
      const { data: prior, error: e } = await db().from("charity_journey_sends").select("id, status, created_at").eq("enrolment_id", r.id).eq("position", position).maybeSingle();
      if (e) throw e;
      const what = prior ? existingSendAction(prior as { status: string; created_at: string }, now) : "leave";
      if (what === "mark_unknown") {
        await db().from("charity_journey_sends").update({ status: "unknown" }).eq("id", prior!.id).eq("status", "sending");
        out.unknown++;
      }
      if (what !== "leave") await advance();
      continue;
    }
    const unlog = () => db().from("charity_journey_sends").delete().eq("id", logged.data.id).eq("status", "sending");
    const notSent = async () => {
      // Definitely not sent: hand back the week and the log, and try again later (or stop after a few tries).
      await unlog();
      const next = afterFailure(r.attempts, now);
      await update(r.id, next.stop ? { status: "stopped", stopped_reason: "not_delivered" } : { attempts: next.attempts, next_due_at: next.due.toISOString() });
      if (next.stop) out.stopped++;
      out.failed++;
    };
    // 2. The donor's week.
    const claim = await db().from("charity_donor_thanks").insert({ charity_id: charityId, donor_id: r.donor_id, week_start: week, kind: JOURNEY_KIND, body: claimNote(position, step.subject), sent_by: null }).select("id").single();
    if (claim.error) {
      await unlog();
      // Another message took this donor's week a moment ago.
      if (claim.error.code === "23505") {
        await update(r.id, { next_due_at: nextWeekStart(now).toISOString() });
        out.waiting++;
        continue;
      }
      throw claim.error;
    }
    const release = () => db().from("charity_donor_thanks").delete().eq("id", claim.data.id);
    const token = randomBytes(32).toString("base64url");
    const saved = await db().from("charity_email_stop_tokens").insert({ token_hash: sha(token), charity_id: charityId, email_hash: emailHash(contact!.email) });
    if (saved.error) {
      await release();
      await notSent();
      continue;
    }
    // 3. The email, with a time limit (never past the job's own end).
    let outcome: "sent" | "skipped" | "maybe" | "refused";
    try {
      outcome = await transport.send({
        ...journeyEmail(contact!.email, {
          charityName: j.name,
          firstName: contact!.greeting,
          subject: step.subject,
          body: step.body,
          pageUrl: charityPageUrl(site, j.slug),
          stopUrl: `${site}/news/stop?t=${token}`,
          oneClickUrl: oneClickStopUrl(site, "news", token),
          replyTo,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (e) {
      console.error("[journey] not sent", e instanceof Error ? e.message : e);
      outcome = failedForSure(e) ? "refused" : "maybe";
    }
    if (outcome === "skipped" || outcome === "refused") {
      await release();
      await notSent();
      continue;
    }
    if (outcome === "maybe") {
      // It may have gone: the week stays claimed and the log stays "sending"; a later run marks it unknown and moves on.
      out.unknown++;
      continue;
    }
    out.sent++;
    const marked = await db().from("charity_journey_sends").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", logged.data.id);
    if (marked.error) console.error("[journey] send not marked", marked.error.message);
    const moved = await advance();
    if (moved.error) console.error("[journey] next email not set", moved.error.message);
  }
}
