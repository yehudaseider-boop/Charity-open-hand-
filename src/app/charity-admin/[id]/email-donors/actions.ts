"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteDraft, loadDraft } from "@/lib/assistant/drafts";
import { requireViewer } from "@/lib/auth";
import { createAppeal, pickAudience, recentSameAppeal, sendAppeal } from "@/lib/charity/appeals";
import { appealEmail, checkAppeal, parseAudience } from "@/lib/charity/appeals-rules";
import { recordAction } from "@/lib/charity/charity-actions";
import { carryOnLine, carryOnStateOf } from "@/lib/charity/carry-on-sends";
import { loadCharityForManager } from "@/lib/charity/queries";
import { refusal } from "@/lib/charity/team";
import { getEmailTransport } from "@/lib/email";
import type { FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";

export type AppealCheck =
  | { state: "idle" }
  | { state: "refused"; message: string; fieldErrors?: Record<string, string> }
  | { state: "checked"; count: number; stopped: number; thisWeek: number; recordedOnly: number; label: string; fingerprint: string; names: string[] };

/** At most this many names in "See who it goes to" (the Donors page lists everyone). */
const NAMES_SHOWN = 200;

const fingerprint = (subject: string, body: string, audience: string) => `${audience}|${subject.length}|${body.length}|${[...`${subject}\n${body}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`;

/** Owner, approved charity, and what was typed: the same checks before checking, testing and sending. */
async function ready(charityId: string, formData: FormData) {
  const { charity, priv } = await loadCharityForManager(charityId);
  const notAllowed = await refusal(charityId, "message");
  if (notAllowed) return { refused: notAllowed };
  if (charity.status !== "approved") return { refused: "You can email your donors once your page is live." } as const;
  const checked = checkAppeal({ subject: formData.get("subject"), body: formData.get("body") });
  const audience = parseAudience(formData.get("audience"));
  if (!checked.ok || !audience) {
    return { refused: "Some details need fixing. Nothing was sent.", fieldErrors: { ...(checked.ok ? {} : checked.fieldErrors), ...(audience ? {} : { audience: "Choose who it goes to" }) } } as const;
  }
  return { charity, priv, subject: checked.subject, body: checked.body, audience, audienceValue: String(formData.get("audience")) } as const;
}

/** Step 1: who it would go to. Sends nothing. */
export async function checkAppealAudience(charityId: string, _prev: AppealCheck, formData: FormData): Promise<AppealCheck> {
  await requireViewer();
  const r = await ready(charityId, formData);
  if ("refused" in r) return { state: "refused", message: r.refused!, fieldErrors: "fieldErrors" in r ? (r.fieldErrors as Record<string, string>) : undefined };
  const pick = await pickAudience(charityId, r.audience);
  if (!pick) return { state: "refused", message: "That list, tag or campaign isn't there any more. Choose again." };
  return { state: "checked", count: pick.donors.length, stopped: pick.stopped, thisWeek: pick.thisWeek, recordedOnly: pick.recordedOnly, label: pick.label, fingerprint: fingerprint(r.subject, r.body, r.audienceValue), names: pick.donors.slice(0, NAMES_SHOWN).map((d) => d.display_name.trim() || "A donor") };
}

/** A copy to the person writing it, exactly as donors will see it. Doesn't count towards anything. */
export async function sendTestAppeal(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const r = await ready(charityId, formData);
  if ("refused" in r) return { ok: false, message: r.refused };
  if (await hitRateLimit("appeal-test", [`user:${viewer.userId}`], 10, 60)) return { ok: false, message: "That's a lot of tests in an hour. Please wait a while and try again." };
  try {
    const outcome = await getEmailTransport().send(
      appealEmail(viewer.email, { charityName: r.charity.name_en, firstName: null, subject: `[Test] ${r.subject}`, body: r.body, stopUrl: "(each donor gets their own stop link here)", replyTo: r.priv?.contact_email ?? null }),
    );
    return outcome === "sent" ? { ok: true, message: `A test went to ${viewer.email}. Check it reads well, then send it.` } : { ok: false, message: "Email isn't switched on here, so the test wasn't sent." };
  } catch {
    return { ok: false, message: "We couldn't send the test just now. Nothing went to donors. Please try again in a few minutes." };
  }
}

/** Step 2: save it and send. Asked first on the page: sent emails can't be called back. */
export async function sendAppealNow(charityId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const r = await ready(charityId, formData);
  if ("refused" in r) return { ok: false, message: r.refused, fieldErrors: "fieldErrors" in r ? (r.fieldErrors as Record<string, string>) : undefined };
  if (String(formData.get("fingerprint") ?? "") !== fingerprint(r.subject, r.body, r.audienceValue)) {
    return { ok: false, message: "You changed the email or who it goes to since you checked. Nothing was sent. Press Check who it goes to again." };
  }
  // Email switched off here (review 20/11/2026): refuse before anything is saved, so no donor's place is used up and
  // the email doesn't count towards this month's four.
  if (getEmailTransport().name === "console") return { ok: false, message: "Email isn't switched on here, so nothing was sent and nothing was used up. Please contact Givezy." };
  if (await recentSameAppeal(charityId, r.subject, r.body)) {
    return { ok: false, message: "This email was already sent a few minutes ago, so it wasn't sent again. If it stopped part way, use Send the rest under Sent below." };
  }
  if (await hitRateLimit("appeal-send", [`charity:${charityId}`], 5, 24 * 60)) return { ok: false, message: "You've sent 5 emails today, the most for one day. Nothing was sent. Please send it tomorrow." };
  const pick = await pickAudience(charityId, r.audience);
  if (!pick) return { ok: false, message: "That list, tag or campaign isn't there any more. Nothing was sent. Choose again." };
  if (!pick.donors.length) return { ok: false, message: "Nobody to send it to: everyone in this group asked not to get emails or already had a message from you this week, or there's nobody in it yet. Nothing was sent." };
  // Only a thank-you prepared with Givy may also show in donors' Givezy app (24/11/2026; Yehuda's default, review
  // 24/11/2026): "in_app" counts only with a draft id that is this person's, on this charity, and not expired.
  // Otherwise it is ignored, so an ordinary email can never be put in the app by changing the form.
  const draftId = String(formData.get("draft") ?? "");
  const givyDraft = draftId ? await loadDraft(draftId, charityId, viewer.userId).catch(() => null) : null;
  const fromGivy = givyDraft !== null && givyDraft !== "gone";
  const inApp = fromGivy && formData.get("in_app") === "yes";
  const appealId = await createAppeal({ charityId, userId: viewer.userId, subject: r.subject, body: r.body, audience: r.audience, pick, inApp });
  const p = await sendAppeal({ charityId, appealId, charityName: r.charity.name_en, replyTo: r.priv?.contact_email ?? null, userId: viewer.userId });
  // Sent: Givy's draft has done its job, so it isn't kept any longer.
  if (fromGivy) await deleteDraft(draftId, charityId, viewer.userId).catch(() => undefined);
  revalidatePath(`/charity-admin/${charityId}/email-donors`);
  // Whether the rest really go out by themselves (the daily job's own rules), so the panel never promises it when they don't.
  const byItself = p?.waiting ? (await carryOnStateOf({ kind: "appeal", charityId, appealId }, { pageLive: true }).catch(() => null)) === "goes" : false;
  const done = await recordAction(charityId, viewer.userId, "appeal_sent", { subject: r.subject, sent: p?.sent ?? 0, waiting: p?.waiting ?? 0, failed: p?.failed ?? 0, skipped: p?.skipped ?? 0, byItself }, null);
  redirect(`/charity-admin/${charityId}/email-donors?done=${done}`);
}

/** "Send the rest": carry on where a long send stopped. Never emails anyone twice. */
export async function continueAppeal(charityId: string, appealId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity, priv } = await loadCharityForManager(charityId);
  const notAllowed = await refusal(charityId, "message");
  if (notAllowed) return { ok: false, message: notAllowed };
  if (charity.status !== "approved") return { ok: false, message: "Your page isn't live just now, so the rest weren't sent. Contact Givezy if you think this is a mistake." };
  if (!/^[0-9a-f-]{36}$/i.test(appealId)) return { ok: false, message: "That email isn't there any more." };
  if (getEmailTransport().name === "console") return { ok: false, message: "Email isn't switched on here, so nothing was sent. The rest are still waiting. Please contact Givezy." };
  const p = await sendAppeal({ charityId, appealId, charityName: charity.name_en, replyTo: priv?.contact_email ?? null, userId: viewer.userId });
  if (!p) return { ok: false, message: "That email isn't there any more." };
  revalidatePath(`/charity-admin/${charityId}/email-donors`);
  if (!p.waiting) return { ok: true, message: `All sent: ${p.sent} delivered to the email service.` };
  // Only say the rest go out by themselves when the daily job really carries them on (review 21/11/2026).
  const state = await carryOnStateOf({ kind: "appeal", charityId, appealId }, { pageLive: true }).catch(() => null);
  return { ok: true, message: `${p.sent} sent so far, ${p.waiting} still to send. ${state ? carryOnLine(state, { owner: true }) : "Press Send the rest again to carry on. Nobody gets it twice."}` };
}
