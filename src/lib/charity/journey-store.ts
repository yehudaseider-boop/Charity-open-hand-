import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getEmailTransport } from "@/lib/email";
import { oneClickStopUrl } from "@/lib/email/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  JOURNEY_ENROL_CAP,
  JOURNEY_RUN_CAP,
  afterSend,
  charityPageUrl,
  claimNote,
  decideDue,
  firstDue,
  journeyEmail,
  newJoiners,
  nextWeekStart,
  planExisting,
  type ExistingSkip,
  type JourneyStep,
} from "./journey";
import type { JourneyState } from "./journey-write";
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

export type Journey = { enabled: boolean; switchedOnAt: string | null; updatedAt: string | null; steps: JourneyStep[] };
export type { JourneyState } from "./journey-write";
export { removeEnrolments, writeJourney } from "./journey-write";

export async function loadJourney(charityId: string): Promise<Journey> {
  const [j, s] = await Promise.all([
    db().from("charity_journeys").select("enabled, switched_on_at, updated_at").eq("charity_id", charityId).maybeSingle(),
    db().from("charity_journey_steps").select("position, subject, body, wait_days").eq("charity_id", charityId).order("position"),
  ]);
  if (j.error) throw j.error;
  if (s.error) throw s.error;
  return {
    enabled: Boolean(j.data?.enabled),
    switchedOnAt: (j.data?.switched_on_at as string | null) ?? null,
    updatedAt: (j.data?.updated_at as string | null) ?? null,
    steps: (s.data ?? []).map((r) => ({ subject: r.subject as string, body: r.body as string, waitDays: Number(r.wait_days) })),
  };
}

export function stateOf(j: Journey): JourneyState {
  return { enabled: j.enabled, switched_on_at: j.switchedOnAt, steps: j.steps };
}


/** Where everyone on the journey is: status and next email, for the counts. */
export async function enrolmentStates(charityId: string): Promise<{ status: string; next_step: number }[]> {
  const out: { status: string; next_step: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("charity_journey_enrolments").select("status, next_step").eq("charity_id", charityId).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as { status: string; next_step: number }[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type JourneyPerson = { id: string; donorId: string; name: string; source: string; status: string; next_step: number; next_due_at: string; stopped_reason: string | null; enrolled_at: string };

/** The most recently moved people on the journey, with their names from their latest paid gift. */
export async function journeyPeople(charityId: string, limit = 50): Promise<JourneyPerson[]> {
  const { data, error } = await db()
    .from("charity_journey_enrolments")
    .select("id, donor_id, source, status, next_step, next_due_at, stopped_reason, enrolled_at")
    .eq("charity_id", charityId)
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

/** Every donor with a paid gift to this charity (on Givezy or recorded by the charity). */
async function allDonorIds(charityId: string): Promise<string[]> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("donations").select("donor_id").eq("charity_id", charityId).eq("status", "paid").not("donor_id", "is", null).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) ids.add(r.donor_id as string);
    if (!data || data.length < 1000) break;
  }
  return [...ids];
}

async function enrolledDonors(charityId: string, donorIds?: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (donorIds) {
    for (let i = 0; i < donorIds.length; i += 200) {
      const { data, error } = await db().from("charity_journey_enrolments").select("donor_id").eq("charity_id", charityId).in("donor_id", donorIds.slice(i, i + 200));
      if (error) throw error;
      for (const r of data ?? []) out.add(r.donor_id as string);
    }
    return out;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("charity_journey_enrolments").select("donor_id").eq("charity_id", charityId).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.donor_id as string);
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** "Add my existing donors": who would join, and why the others wouldn't. Counts only leave this file. */
export async function planExistingDonors(charityId: string) {
  const ids = await allDonorIds(charityId);
  const [who, already] = await Promise.all([contacts(charityId, ids), enrolledDonors(charityId)]);
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
  if (!journey.steps.length) return { ids: [], skipped: { already: 0, erased: 0, opted_out: 0, recorded_only: 0 }, firstDue: null };
  const plan = await planExistingDonors(charityId);
  const due = firstDue(now, journey.steps).toISOString();
  const ids: string[] = [];
  for (let i = 0; i < plan.add.length; i += 500) {
    const rows = plan.add.slice(i, i + 500).map((c) => ({ charity_id: charityId, donor_id: c.donorId, source: "existing", enrolled_at: now.toISOString(), next_step: 1, next_due_at: due }));
    const { data, error } = await db().from("charity_journey_enrolments").upsert(rows, { onConflict: "charity_id,donor_id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    for (const r of data ?? []) ids.push(r.id as string);
  }
  // Someone added at the same moment by another press or the daily job: counted as already on it.
  plan.skipped.already += plan.add.length - ids.length;
  return { ids, skipped: plan.skipped, firstDue: due };
}


export type JourneyRun = { enrolled: number; sent: number; waiting: number; stopped: number; finished: number; failed: number; leftOver: number; emailOff: boolean };

/**
 * The daily job's part (after collections and checks): add new donors to switched-on journeys, then send the emails
 * that are due, up to JOURNEY_RUN_CAP and the deadline; the rest go the next day. With email not switched on, nothing
 * is sent and nothing is marked sent. Each email claims the donor's week first (handed back if it couldn't go).
 */
export async function runJourneys(now: Date, deadline: number): Promise<JourneyRun> {
  const out: JourneyRun = { enrolled: 0, sent: 0, waiting: 0, stopped: 0, finished: 0, failed: 0, leftOver: 0, emailOff: false };
  const { data: journeys, error } = await db().from("charity_journeys").select("charity_id, switched_on_at, charities(status, name_en, slug)").eq("enabled", true);
  if (error) throw error;
  type Live = { charityId: string; switchedOnAt: Date; name: string; slug: string; steps: JourneyStep[] };
  const live: Live[] = [];
  for (const j of journeys ?? []) {
    const raw = j.charities as unknown;
    const c = (Array.isArray(raw) ? raw[0] : raw) as { status: string; name_en: string; slug: string } | null;
    // Only a charity whose page is live sends anything.
    if (!c || c.status !== "approved" || !j.switched_on_at) continue;
    const steps = (await loadJourney(j.charity_id as string)).steps;
    if (steps.length) live.push({ charityId: j.charity_id as string, switchedOnAt: new Date(j.switched_on_at as string), name: c.name_en, slug: c.slug, steps });
  }

  // 1. New donors: first paid gift on Givezy while the journey was on. Looks back 35 days, enough for a missed day.
  let room = JOURNEY_ENROL_CAP;
  for (const j of live) {
    if (room <= 0 || Date.now() >= deadline) break;
    const since = new Date(Math.max(j.switchedOnAt.getTime(), now.getTime() - 35 * 86_400_000)).toISOString();
    const first = new Map<string, Date>();
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error: e } = await db()
        .from("donations")
        .select("donor_id, paid_at")
        .eq("charity_id", j.charityId)
        .eq("status", "paid")
        .neq("gateway", "recorded")
        .not("donor_id", "is", null)
        .gte("paid_at", since)
        .order("paid_at")
        .range(from, from + 999);
      if (e) throw e;
      for (const r of data ?? []) if (!first.has(r.donor_id as string)) first.set(r.donor_id as string, new Date(r.paid_at as string));
      if (!data || data.length < 1000) break;
    }
    if (!first.size) continue;
    const ids = [...first.keys()];
    // A gift before the switch (or a recorded one) means they were already a donor: "Add my existing donors" covers them.
    const earlier = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error: e } = await db()
        .from("donations")
        .select("donor_id")
        .eq("charity_id", j.charityId)
        .in("status", ["paid", "refunded", "charged_back"])
        .in("donor_id", ids.slice(i, i + 200))
        .lt("paid_at", j.switchedOnAt.toISOString());
      if (e) throw e;
      for (const r of data ?? []) earlier.add(r.donor_id as string);
    }
    for (const id of earlier) first.delete(id);
    const joiners = newJoiners(first, j.switchedOnAt, await enrolledDonors(j.charityId, [...first.keys()])).slice(0, room);
    if (!joiners.length) continue;
    const rows = joiners.map((n) => ({ charity_id: j.charityId, donor_id: n.donorId, source: "new_gift", enrolled_at: n.joined.toISOString(), next_step: 1, next_due_at: firstDue(n.joined, j.steps).toISOString() }));
    const { data, error: e } = await db().from("charity_journey_enrolments").upsert(rows, { onConflict: "charity_id,donor_id", ignoreDuplicates: true }).select("id");
    if (e) throw e;
    out.enrolled += data?.length ?? 0;
    room -= data?.length ?? 0;
  }

  // 2. Emails that are due.
  const transport = getEmailTransport();
  if (transport.name === "console") {
    out.emailOff = true;
    return out;
  }
  if (!live.length) return out;
  const byCharity = new Map(live.map((j) => [j.charityId, j]));
  const { data: due, error: dueError } = await db()
    .from("charity_journey_enrolments")
    .select("id, charity_id, donor_id, next_step")
    .eq("status", "active")
    .lte("next_due_at", now.toISOString())
    .in("charity_id", [...byCharity.keys()])
    .order("next_due_at")
    .limit(JOURNEY_RUN_CAP + 1);
  if (dueError) throw dueError;
  const rows = (due ?? []).slice(0, JOURNEY_RUN_CAP);
  out.leftOver = (due ?? []).length - rows.length;
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const week = weekStart(now);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.charity_id as string, [...(groups.get(r.charity_id as string) ?? []), r]);
  const update = (id: string, set: Record<string, unknown>) => db().from("charity_journey_enrolments").update({ ...set, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "active");

  for (const [charityId, list] of groups) {
    const j = byCharity.get(charityId)!;
    if (Date.now() >= deadline) {
      out.leftOver += list.length;
      continue;
    }
    const donorIds = list.map((r) => r.donor_id as string);
    const [who, priv] = await Promise.all([contacts(charityId, donorIds), db().from("charity_private").select("contact_email").eq("charity_id", charityId).maybeSingle()]);
    const replyTo = (priv.data?.contact_email as string | null) ?? null;
    const withEmail = donorIds.flatMap((id) => {
      const c = who.byDonor.get(id);
      return c ? [{ donorId: id, hash: emailHash(c.email) }] : [];
    });
    const [stopped, recent] = await Promise.all([optedOutHashes(charityId, withEmail.map((d) => d.hash)), messagedThisWeek(charityId, withEmail, now)]);
    for (let at = 0; at < list.length; at++) {
      const r = list[at];
      if (Date.now() >= deadline) {
        out.leftOver += list.length - at;
        break;
      }
      const donorId = r.donor_id as string;
      const contact = who.byDonor.get(donorId) ?? null;
      const decision = decideDue(
        { hasGift: who.found.has(donorId), erased: who.erased.has(donorId), email: contact?.email ?? null, optedOut: contact ? stopped.has(emailHash(contact.email)) : false, messagedThisWeek: recent.has(donorId), nextStep: Number(r.next_step) },
        j.steps.length,
      );
      if (decision.kind === "stop") {
        await update(r.id as string, { status: "stopped", stopped_reason: decision.reason });
        out.stopped++;
        continue;
      }
      if (decision.kind === "finish") {
        await update(r.id as string, { status: "finished", next_step: Math.min(6, j.steps.length + 1) });
        out.finished++;
        continue;
      }
      if (decision.kind === "wait_week") {
        await update(r.id as string, { next_due_at: nextWeekStart(now).toISOString() });
        out.waiting++;
        continue;
      }
      const position = Number(r.next_step);
      const step = j.steps[position - 1];
      const advance = () => {
        const next = afterSend(position, new Date(), j.steps);
        return update(r.id as string, next ? { next_step: next.nextStep, next_due_at: next.due.toISOString() } : { status: "finished", next_step: position + 1 });
      };
      // The send log is claimed first: an email that went before a hiccup is never sent twice.
      const logged = await db().from("charity_journey_sends").insert({ enrolment_id: r.id, charity_id: charityId, position }).select("id").single();
      if (logged.error) {
        if (logged.error.code === "23505") {
          // This email went already (the move to the next one didn't save): move on now.
          await advance();
          continue;
        }
        throw logged.error;
      }
      const unlog = () => db().from("charity_journey_sends").delete().eq("id", logged.data.id);
      const claim = await db().from("charity_donor_thanks").insert({ charity_id: charityId, donor_id: donorId, week_start: week, kind: JOURNEY_KIND, body: claimNote(position, step.subject), sent_by: null }).select("id").single();
      if (claim.error) {
        await unlog();
        // Another message took this donor's week a moment ago.
        if (claim.error.code === "23505") {
          await update(r.id as string, { next_due_at: nextWeekStart(now).toISOString() });
          out.waiting++;
          continue;
        }
        throw claim.error;
      }
      const release = async () => {
        await db().from("charity_donor_thanks").delete().eq("id", claim.data.id);
        await unlog();
      };
      const token = randomBytes(32).toString("base64url");
      const saved = await db().from("charity_email_stop_tokens").insert({ token_hash: sha(token), charity_id: charityId, email_hash: emailHash(contact!.email) });
      if (saved.error) {
        await release();
        out.failed++;
        continue;
      }
      let outcome: "sent" | "skipped" | "error" = "error";
      try {
        outcome = await transport.send(
          journeyEmail(contact!.email, {
            charityName: j.name,
            firstName: contact!.greeting,
            subject: step.subject,
            body: step.body,
            pageUrl: charityPageUrl(site, j.slug),
            stopUrl: `${site}/news/stop?t=${token}`,
            oneClickUrl: oneClickStopUrl(site, "news", token),
            replyTo,
          }),
        );
      } catch (e) {
        console.error("[journey] not sent", e instanceof Error ? e.message : e);
      }
      if (outcome !== "sent") {
        // Not sent (an error, or an address the test site may not email): the week is handed back and the step stays due.
        await release();
        out.failed++;
        continue;
      }
      out.sent++;
      const moved = await advance();
      if (moved.error) console.error("[journey] next email not set", moved.error.message);
    }
  }
  return out;
}
