"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/auth";
import { recordAction, same } from "@/lib/charity/charity-actions";
import { EXISTING_SKIPS, JOURNEY_MAX_STEPS, checkJourneySteps, existingOutcome } from "@/lib/charity/journey";
import { addExistingDonors } from "@/lib/charity/journey-store";
import { readJourneyState, writeJourney } from "@/lib/charity/journey-write";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner } from "@/lib/charity/team";
import { formatDate } from "@/lib/dates";
import type { FormState } from "@/lib/form";
import { hitRateLimit, rateLimitReached } from "@/lib/rate-limit";

/**
 * The donor journey (CRM step 6a, 10/11/2026). Owner only, as for the s18A reminder, Thank donors and Email donors
 * (roles come in step 9); other admins see it. Saving and the switch can be taken back (Undo); adding existing donors
 * is asked first on the page and can be taken back until their first email goes.
 */

const NOT_OWNER = "Only your charity's owner can change the donor journey. Nothing was changed.";
const page = (id: string) => `/charity-admin/${id}/journey`;
/** The most ids Undo keeps for "Add my existing donors". Beyond it the action stands, as the page said. */
const UNDO_IDS = 5000;

export async function saveJourney(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws (not found) unless the signed-in person, with their second step, manages this charity.
  await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: NOT_OWNER };
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
  const before = await readJourneyState(charityId);
  if (same(before.steps, checked.steps)) return { ok: true, message: "These are the emails already saved. Nothing changed." };
  try {
    await writeJourney(charityId, viewer.userId, { ...before, steps: checked.steps });
  } catch (e) {
    console.error("[journey] not saved", e instanceof Error ? e.message : e);
    return { ok: false, message: "That didn't save, so your journey is as it was. What you typed is still here. Please try again." };
  }
  const after = await readJourneyState(charityId);
  await logAudit({ actorUserId: viewer.userId, action: "charity.journey_saved", entityType: "charity", entityId: charityId, details: { steps: after.steps.length } });
  const done = await recordAction(charityId, viewer.userId, "journey_saved", { steps: after.steps.length, on: after.enabled }, { type: "journey", before, after });
  revalidatePath(page(charityId));
  redirect(`${page(charityId)}?done=${done}`);
}

export async function switchJourney(charityId: string, on: boolean, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: NOT_OWNER };
  const before = await readJourneyState(charityId);
  if (on && charity.status !== "approved") return { ok: false, message: "You can switch your journey on once your page is live. Nothing was changed." };
  if (on && !before.steps.length) return { ok: false, message: "Save at least one email first, then switch it on. Nothing was changed." };
  if (before.enabled === on) return { ok: true, message: on ? "Your journey is on already. Nothing changed." : "Your journey is off already. Nothing changed." };
  try {
    await writeJourney(charityId, viewer.userId, { ...before, enabled: on, switched_on_at: on ? new Date().toISOString() : before.switched_on_at });
  } catch (e) {
    console.error("[journey] switch not saved", e instanceof Error ? e.message : e);
    return { ok: false, message: `That didn't save, so your journey is still ${on ? "off" : "on"}. Please try again.` };
  }
  const after = await readJourneyState(charityId);
  await logAudit({ actorUserId: viewer.userId, action: on ? "charity.journey_on" : "charity.journey_off", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, on ? "journey_on" : "journey_off", { steps: after.steps.length }, { type: "journey", before, after });
  revalidatePath(page(charityId));
  redirect(`${page(charityId)}?done=${done}`);
}

/** "Add my existing donors": asked first on the page, with the count. A donor already on the journey is never added twice. */
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
