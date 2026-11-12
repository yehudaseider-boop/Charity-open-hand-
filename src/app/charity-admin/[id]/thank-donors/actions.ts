"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAction } from "@/lib/charity/charity-actions";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { refusal } from "@/lib/charity/team";
import { checkThankYou, monthLabel, recentMonths } from "@/lib/charity/thank-you";
import { continueThankYou, sendThankYou } from "@/lib/charity/thank-you-send";
import type { FormState } from "@/lib/form";
import { logAudit } from "@/lib/audit";
import { checkThankYouNote } from "@/lib/charity/thank-you-note";
import { createClient } from "@/lib/supabase/server";

/** Only the owner sends thank-yous (Yehuda, 02/11/2026), as for Email donors. */

export async function sendThankDonors(charityId: string, month: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  const { charity, priv } = await loadCharityForManager(charityId);
  const notAllowed = await refusal(charityId, "message");
  if (notAllowed) return { ok: false, message: notAllowed };
  if (charity.status !== "approved") return { ok: false, message: "You can thank donors once your page is live." };
  if (!recentMonths(new Date()).includes(month)) return { ok: false, message: "Choose one of the last three months." };
  const checked = checkThankYou(String(formData.get("body") ?? ""));
  if (!checked.ok) return { ok: false, fieldErrors: { body: checked.message } };
  const r = await sendThankYou({ charityId, charityName: charity.name_en, month, body: checked.body, userId: viewer.userId, replyTo: priv?.contact_email ?? null });
  revalidatePath(`/charity-admin/${charityId}/thank-donors`);
  if (!r.ok) return { ok: false, message: r.message };
  // Sent emails can't be called back, so there is no undo: the page asked first.
  const done = await recordAction(charityId, viewer.userId, "thank_you_sent", { month: monthLabel(month), sent: r.sent, failed: r.failed, remaining: r.remaining, thisWeek: r.thisWeek ?? 0, from: r.from ?? null }, null);
  redirect(`/charity-admin/${charityId}/thank-donors?done=${done}`);
}

/** "Send the rest" of a month's thank-you that stopped part way (same words; nobody is emailed twice). */
export async function sendRestOfThankYou(charityId: string, month: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity, priv } = await loadCharityForManager(charityId);
  const notAllowed = await refusal(charityId, "message");
  if (notAllowed) return { ok: false, message: notAllowed };
  if (charity.status !== "approved") return { ok: false, message: "You can thank donors once your page is live." };
  const r = await continueThankYou({ charityId, charityName: charity.name_en, month, userId: viewer.userId, replyTo: priv?.contact_email ?? null });
  revalidatePath(`/charity-admin/${charityId}/thank-donors`);
  if (!r.ok) return { ok: false, message: r.message };
  const done = await recordAction(charityId, viewer.userId, "thank_you_sent", { month: monthLabel(month), sent: r.sent, failed: r.failed, remaining: r.remaining, thisWeek: r.thisWeek ?? 0, from: r.from ?? null }, null);
  redirect(`/charity-admin/${charityId}/thank-donors?done=${done}`);
}

/**
 * The charity's own paragraph in the thank-you email after each gift (10/11/2026). "Save" keeps what was
 * typed; "Back to Givezy's wording" clears it. Anyone who manages the charity may, as for the public profile
 * (it is the same field), and the same row-level rules decide. Nothing is emailed by saving. Undo puts the
 * previous wording back.
 */
export async function saveThankYouWording(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  const { charity } = await loadCharityForManager(charityId);
  const refused = await refusal(charityId, "profile");
  if (refused) return { ok: false, message: refused };
  const reset = formData.get("intent") === "reset";
  const checked = reset ? ({ ok: true, note: null } as const) : checkThankYouNote(String(formData.get("note") ?? ""));
  if (!checked.ok) return { ok: false, fieldErrors: { note: checked.message } };
  const before = charity.thank_you_en ?? null;
  const after = checked.note;
  if (before === after) {
    return { ok: true, message: after ? "That is the note already saved. Nothing changed." : "You're on Givezy's wording already. Nothing changed." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("charities").update({ thank_you_en: after }).eq("id", charityId).select("id");
  if (error) {
    console.error(error);
    return { ok: false, message: "That didn't save, so your thank-you email is worded as before. What you typed is still here. Please try again." };
  }
  if (!data?.length) return { ok: false, message: "You can't edit this charity. Nothing was saved." };
  await logAudit({ actorUserId: viewer.userId, action: after ? "charity.thank_you_wording_saved" : "charity.thank_you_wording_cleared", entityType: "charity", entityId: charityId });
  const done = await recordAction(charityId, viewer.userId, "thank_you_wording_saved", { cleared: !after }, {
    type: "restore", table: "charities", before: { thank_you_en: before }, after: { thank_you_en: after },
  });
  revalidatePath(`/charity-admin/${charityId}/thank-donors`);
  revalidatePath(`/charity-admin/${charityId}/profile`);
  redirect(`/charity-admin/${charityId}/thank-donors?done=${done}`);
}
