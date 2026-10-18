"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAction } from "@/lib/charity/charity-actions";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { checkThankYou, monthLabel, recentMonths } from "@/lib/charity/thank-you";
import { sendThankYou } from "@/lib/charity/thank-you-send";
import type { FormState } from "@/lib/form";

export async function sendThankDonors(charityId: string, month: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  const { charity } = await loadCharityForManager(charityId);
  if (charity.status !== "approved") return { ok: false, message: "You can thank donors once your page is live." };
  if (!recentMonths(new Date()).includes(month)) return { ok: false, message: "Choose one of the last three months." };
  const checked = checkThankYou(String(formData.get("body") ?? ""));
  if (!checked.ok) return { ok: false, fieldErrors: { body: checked.message } };
  const r = await sendThankYou({ charityId, charityName: charity.name_en, month, body: checked.body, userId: viewer.userId });
  revalidatePath(`/charity-admin/${charityId}/thank-donors`);
  if (!r.ok) return { ok: false, message: r.message };
  // Sent emails can't be called back, so there is no undo: the page asked first.
  const done = await recordAction(charityId, viewer.userId, "thank_you_sent", { month: monthLabel(month), sent: r.sent, failed: r.failed }, null);
  redirect(`/charity-admin/${charityId}/thank-donors?done=${done}`);
}
