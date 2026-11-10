"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { MAX_REMINDERS, reminderOutcome } from "@/lib/charity/s18a-reminder";
import { sendS18aReminders } from "@/lib/charity/s18a-reminder-send";
import { isOwner } from "@/lib/charity/team";
import type { FormState } from "@/lib/form";
import { isUuid } from "@/lib/ids";
import { hitRateLimit, rateLimitReached } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-path";

/**
 * "Remind to add their details" (CRM step 2, 10/11/2026): emails each chosen donor with s18A details missing, in the
 * charity's name. Owner only, as for Email donors, Thank donors and importing donors (roles come in step 9). Asked
 * first on the page: an email can't be called back, so there is no Undo, only the record of what happened.
 */
export async function remindS18aDetails(charityId: string, back: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws (not found) unless the signed-in person, with their second step, manages this charity.
  const { charity, priv } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: "Only your charity's owner can send reminders. Nothing was sent." };
  if (charity.status !== "approved") return { ok: false, message: "You can send reminders once your page is live. Nothing was sent." };
  const donorIds = [...new Set(formData.getAll("donor").map(String).filter(isUuid))];
  if (!donorIds.length) return { ok: false, message: "Choose at least one donor first. Nothing was sent." };
  if (donorIds.length > MAX_REMINDERS) return { ok: false, message: `You can remind up to ${MAX_REMINDERS.toLocaleString("en-ZA")} donors at a time. Nothing was sent. Narrow the list with a group, tag or search.` };
  // Reminders are a few presses a day, not a mailing tool. Checked first and counted only once an email was actually
  // tried: a press where everyone is skipped (already messaged this week, opted out) doesn't use up the day.
  const keys = [`charity:${charityId}`];
  if (await rateLimitReached("s18a-reminder", keys, 10, 24 * 60)) {
    return { ok: false, message: "You've sent reminders 10 times today, the most for one day. Nothing was sent. Please try again tomorrow." };
  }
  // Writes the audit entry and the dashboard record itself, with the counts so far, even if sending stops part way.
  const r = await sendS18aReminders({ charityId, charityName: charity.name_en, donorIds, userId: viewer.userId, replyTo: priv?.contact_email ?? null });
  if (r.sent || r.failed) {
    // Counting must never hide what was sent: a failure here is logged, not shown.
    await hitRateLimit("s18a-reminder", keys, 10, 24 * 60).catch((e: unknown) => console.error("[s18a-reminder] press not counted", e instanceof Error ? e.message : e));
  }
  // Nothing went: say why on the form, with the choice kept.
  if (r.sent === 0 && r.failed === 0 && r.remaining === 0) return { ok: false, message: reminderOutcome(r) };
  if (r.sent === 0 && r.remaining === 0) return { ok: false, message: `${reminderOutcome(r)} Nothing went out.` };
  const done = r.done;
  // The record couldn't be written: say what happened on the form instead.
  if (!done) return { ok: r.sent > 0, message: reminderOutcome(r) };
  const fallback = `/charity-admin/${charityId}/donors`;
  const safe = safeNextPath(back, fallback);
  const page = safe.startsWith(fallback) ? safe : fallback;
  redirect(`${page}${page.includes("?") ? "&" : "?"}done=${done}`);
}
