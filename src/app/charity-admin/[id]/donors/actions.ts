"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { recordAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { checkThankYou } from "@/lib/charity/thank-you";
import { sendDonorThankYou } from "@/lib/charity/thank-you-send";
import { isUuid } from "@/lib/ids";
import type { FormState } from "@/lib/form";

/** "Say thank you" on one donor: a short personal email from the charity, sent by Givezy. */
export async function thankOneDonor(charityId: string, donorId: string, back: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  const { charity, priv } = await loadCharityForManager(charityId);
  if (charity.status !== "approved") return { ok: false, message: "You can thank donors once your page is live." };
  if (!isUuid(donorId)) return { ok: false, message: "We couldn't find that donor. Please reload the page." };
  const checked = checkThankYou(String(formData.get("body") ?? ""));
  if (!checked.ok) return { ok: false, fieldErrors: { body: checked.message } };
  const replyTo = priv?.contact_email ?? null;
  const r = await sendDonorThankYou({ charityId, charityName: charity.name_en, donorId, body: checked.body, userId: viewer.userId, replyTo });
  if (!r.ok) return { ok: false, message: r.message };
  // A sent email can't be called back, so there is no undo: the form asked first.
  const done = await recordAction(charityId, viewer.userId, "donor_thanked", { name: r.name, replyTo }, null);
  const page = back.startsWith(`/charity-admin/${charityId}/donors`) ? back : `/charity-admin/${charityId}/donors`;
  redirect(`${page}${page.includes("?") ? "&" : "?"}done=${done}`);
}
