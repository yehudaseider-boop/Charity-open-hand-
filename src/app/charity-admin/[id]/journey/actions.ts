"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { recordAction, same } from "@/lib/charity/charity-actions";
import {
  EXISTING_SKIPS,
  JOURNEY_MAX_STEPS,
  WINBACK,
  WINBACK_PRESSES_PER_DAY,
  checkJourneySteps,
  chosenDonors,
  existingOutcome,
  parseRefKey,
  refKey,
  winbackOutcome,
  type JourneyRef,
} from "@/lib/charity/journey";
import { addExistingDonors, addWinbackDonors } from "@/lib/charity/journey-store";
import { journeysV2, readJourneyState, writeJourney } from "@/lib/charity/journey-write";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner, refusal } from "@/lib/charity/team";
import { formatDate } from "@/lib/dates";
import type { FormState } from "@/lib/form";
import { hitRateLimit, rateLimitReached } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The donor journeys (CRM steps 6a, 6b and 7, 10/11/2026): the general journey, one per campaign, and win-back.
 * Changing a journey is part of "message" (Owner, Admin, Fundraiser). Adding existing donors and adding donors to the
 * win-back journey stay the owner's, asked first on the page, and can be taken back until their first email goes.
 * Saving and the switch can be taken back (Undo).
 */

const page = (id: string, ref: JourneyRef = { kind: "general" }) => (ref.kind === "general" ? `/charity-admin/${id}/journey` : `/charity-admin/${id}/journey?j=${encodeURIComponent(refKey(ref))}`);
const withDone = (id: string, ref: JourneyRef, done: string) => `${page(id, ref)}${ref.kind === "general" ? "?" : "&"}done=${done}`;
/** The most ids Undo keeps for adding donors. Beyond it the action stands, as the page said. */
const UNDO_IDS = 5000;

/**
 * The journey a form names, if this charity may have it: the general one always; win-back and campaign journeys once
 * their migration has run; a campaign only if it is this charity's own. Null otherwise. The campaign's title comes back
 * for the words on the page.
 */
async function journeyFor(charityId: string, key: string): Promise<{ ref: JourneyRef; title: string | null } | null> {
  const ref = parseRefKey(key);
  if (!ref) return null;
  if (ref.kind === "general") return { ref, title: null };
  if (!(await journeysV2())) return null;
  if (ref.kind === "winback") return { ref, title: null };
  const { data, error } = await createAdminClient().from("campaigns").select("title").eq("id", ref.campaignId).eq("charity_id", charityId).maybeSingle();
  if (error) throw error;
  return data ? { ref, title: data.title as string } : null;
}

const UNKNOWN: FormState = { ok: false, message: "We couldn't find that journey. Nothing was changed. Go back to your journeys and try again." };

export async function saveJourney(charityId: string, key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws (not found) unless the signed-in person, with their second step, manages this charity.
  await loadCharityForManager(charityId);
  const notAllowed = await refusal(charityId, "message");
  if (notAllowed) return { ok: false, message: notAllowed };
  const which = await journeyFor(charityId, key);
  if (!which) return UNKNOWN;
  const count = Math.min(JOURNEY_MAX_STEPS + 1, Math.max(0, Number(formData.get("steps") ?? 0) || 0));
  const raw = Array.from({ length: count }, (_, i) => ({ subject: formData.get(`subject_${i + 1}`), body: formData.get(`body_${i + 1}`), waitDays: formData.get(`wait_${i + 1}`) }));
  const checked = checkJourneySteps(raw);
  if (!checked.ok) {
    const fieldErrors: Record<string, string> = {};
    checked.errors.forEach((e, i) => {
      if (e.subject) fieldErrors[`subject_${i + 1}`] = e.subject;
      if (e.body) fieldErrors[`body_${i + 1}`] = e.body;
      if (e.waitDays) fieldErrors[`wait_${i + 1}`] = e.waitDays;
    });
    return { ok: false, message: checked.message, fieldErrors };
  }
  const before = await readJourneyState(charityId, which.ref);
  if (same(before.steps, checked.steps)) return { ok: true, message: "These are the emails already saved. Nothing changed." };
  try {
    await writeJourney(charityId, viewer.userId, { ...before, steps: checked.steps }, which.ref);
  } catch (e) {
    console.error("[journey] not saved", e instanceof Error ? e.message : e);
    return { ok: false, message: "That didn't save, so your journey is as it was. What you typed is still here. Please try again." };
  }
  const after = await readJourneyState(charityId, which.ref);
  await logAudit({ actorUserId: viewer.userId, action: "charity.journey_saved", entityType: "charity", entityId: charityId, details: { steps: after.steps.length, journey: refKey(which.ref) } });
  const done = await recordAction(charityId, viewer.userId, "journey_saved", { steps: after.steps.length, on: after.enabled, jkey: refKey(which.ref), jtitle: which.title }, { type: "journey", ref: which.ref, before, after });
  revalidatePath(page(charityId));
  redirect(withDone(charityId, which.ref, done));
}

export async function switchJourney(charityId: string, key: string, on: boolean, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  const notAllowed = await refusal(charityId, "message");
  if (notAllowed) return { ok: false, message: notAllowed };
  const which = await journeyFor(charityId, key);
  if (!which) return UNKNOWN;
  const before = await readJourneyState(charityId, which.ref);
  if (on && charity.status !== "approved") return { ok: false, message: "You can switch a journey on once your page is live. Nothing was changed." };
  if (on && !before.steps.length) return { ok: false, message: "Save at least one email first, then switch it on. Nothing was changed." };
  if (before.enabled === on) return { ok: true, message: on ? "This journey is on already. Nothing changed." : "This journey is off already. Nothing changed." };
  try {
    await writeJourney(charityId, viewer.userId, { ...before, enabled: on, switched_on_at: on ? new Date().toISOString() : before.switched_on_at }, which.ref);
  } catch (e) {
    console.error("[journey] switch not saved", e instanceof Error ? e.message : e);
    return { ok: false, message: `That didn't save, so this journey is still ${on ? "off" : "on"}. Please try again.` };
  }
  const after = await readJourneyState(charityId, which.ref);
  await logAudit({ actorUserId: viewer.userId, action: on ? "charity.journey_on" : "charity.journey_off", entityType: "charity", entityId: charityId, details: { journey: refKey(which.ref) } });
  const done = await recordAction(charityId, viewer.userId, on ? "journey_on" : "journey_off", { steps: after.steps.length, jkey: refKey(which.ref), jtitle: which.title }, { type: "journey", ref: which.ref, before, after });
  revalidatePath(page(charityId));
  redirect(withDone(charityId, which.ref, done));
}

/** "Add my existing donors" to the general journey: asked first on the page, with the count. Never added twice. */
export async function addExisting(charityId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: "Only your charity's owner can add donors to the journey. Nobody was added." };
  if (charity.status !== "approved") return { ok: false, message: "You can add donors once your page is live. Nobody was added." };
  const state = await readJourneyState(charityId);
  if (!state.enabled) return { ok: false, message: "Switch your journey on first, then add your existing donors. Nobody was added." };
  const keys = [`charity:${charityId}`];
  if (await rateLimitReached("journey-existing", keys, 5, 24 * 60)) return { ok: false, message: "You've added donors 5 times today, the most for one day. Nobody was added. Please try again tomorrow." };
  await hitRateLimit("journey-existing", keys, 5, 24 * 60);
  let r;
  try {
    r = await addExistingDonors(charityId);
  } catch (e) {
    console.error("[journey] existing not added", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong on our side. Anyone added before it stopped stays on, and nobody is added twice, so you can safely try again." };
  }
  const firstEmail = r.firstDue ? formatDate(r.firstDue) : null;
  if (!r.ids.length) return { ok: false, message: existingOutcome({ added: 0, skipped: r.skipped, firstEmail }) };
  await logAudit({ actorUserId: viewer.userId, action: "charity.journey_existing_added", entityType: "charity", entityId: charityId, details: { added: r.ids.length, ...r.skipped } });
  const done = await recordAction(
    charityId,
    viewer.userId,
    "journey_existing_added",
    { added: r.ids.length, firstEmail, ...Object.fromEntries(EXISTING_SKIPS.map((k) => [`skipped_${k}`, r.skipped[k]])) },
    r.ids.length <= UNDO_IDS ? { type: "journey_enrolments", ids: r.ids } : null,
  );
  revalidatePath(page(charityId));
  redirect(`${page(charityId)}?done=${done}`);
}

/**
 * "Add to win-back journey" (CRM step 7): the donors chosen on the stopped monthly or keeping-donors list. Owner only,
 * asked first on the page with the count and who is left out. At most WINBACK_PRESS_CAP a press and
 * WINBACK_PRESSES_PER_DAY presses a day. Undo takes off those who haven't had an email yet.
 */
export async function addWinback(charityId: string, donorIds: string[], _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: "Only your charity's owner can add donors to the win-back journey. Nobody was added." };
  if (charity.status !== "approved") return { ok: false, message: "You can add donors once your page is live. Nobody was added." };
  if (!(await journeysV2())) return { ok: false, message: "The win-back journey isn't switched on for your charity yet. Nobody was added." };
  const state = await readJourneyState(charityId, WINBACK);
  if (!state.enabled) return { ok: false, message: "Switch your win-back journey on first, then add donors. Nobody was added." };
  const { ids } = chosenDonors(donorIds);
  if (!ids.length) return { ok: false, message: "Choose at least one donor first. Nobody was added." };
  const keys = [`charity:${charityId}`];
  if (await rateLimitReached("journey-winback", keys, WINBACK_PRESSES_PER_DAY, 24 * 60)) {
    return { ok: false, message: `You've added donors to the win-back journey ${WINBACK_PRESSES_PER_DAY} times today, the most for one day. Nobody was added. Please try again tomorrow.` };
  }
  await hitRateLimit("journey-winback", keys, WINBACK_PRESSES_PER_DAY, 24 * 60);
  let r;
  try {
    r = await addWinbackDonors(charityId, ids);
  } catch (e) {
    console.error("[journey] win-back not added", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong on our side. Anyone added before it stopped stays on, and nobody is added twice, so you can safely try again." };
  }
  const firstEmail = r.firstDue ? formatDate(r.firstDue) : null;
  if (!r.ids.length) return { ok: false, message: winbackOutcome({ added: 0, skipped: r.skipped, firstEmail }) };
  await logAudit({ actorUserId: viewer.userId, action: "charity.journey_winback_added", entityType: "charity", entityId: charityId, details: { added: r.ids.length, ...r.skipped } });
  const done = await recordAction(
    charityId,
    viewer.userId,
    "journey_winback_added",
    { added: r.ids.length, firstEmail, jkey: "winback", ...Object.fromEntries(EXISTING_SKIPS.map((k) => [`skipped_${k}`, r.skipped[k]])) },
    r.ids.length <= UNDO_IDS ? { type: "journey_enrolments", ids: r.ids } : null,
  );
  revalidatePath(page(charityId, WINBACK));
  redirect(withDone(charityId, WINBACK, done));
}
