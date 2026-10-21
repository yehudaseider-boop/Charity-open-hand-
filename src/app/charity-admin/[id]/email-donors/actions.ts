"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createAppeal, pickAudience, sendAppeal } from "@/lib/charity/appeals";
import { appealEmail, checkAppeal, parseAudience } from "@/lib/charity/appeals-rules";
import { recordAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner } from "@/lib/charity/team";
import { getEmailTransport } from "@/lib/email";
import type { FormState } from "@/lib/form";
import { hitRateLimit } from "@/lib/rate-limit";

export type AppealCheck =
  | { state: "idle" }
  | { state: "refused"; message: string; fieldErrors?: Record<string, string> }
  | { state: "checked"; count: number; stopped: number; recordedOnly: number; label: string; fingerprint: string };

const fingerprint = (subject: string, body: string, audience: string) => `${audience}|${subject.length}|${body.length}|${[...`${subject}\n${body}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}`;

/** Owner, approved charity, and what was typed: the same checks before checking, testing and sending. */
async function ready(charityId: string, formData: FormData) {
  const { charity, priv } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { refused: "Only your charity's owner can email your donors. Nothing was sent." } as const;
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
  return { state: "checked", count: pick.donors.length, stopped: pick.stopped, recordedOnly: pick.recordedOnly, label: pick.label, fingerprint: fingerprint(r.subject, r.body, r.audienceValue) };
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
  if (await hitRateLimit("appeal-send", [`charity:${charityId}`], 5, 24 * 60)) return { ok: false, message: "You've sent 5 emails today, the most for one day. Nothing was sent. Please send it tomorrow." };
  const pick = await pickAudience(charityId, r.audience);
  if (!pick) return { ok: false, message: "That list, tag or campaign isn't there any more. Nothing was sent. Choose again." };
  if (!pick.donors.length) return { ok: false, message: "Nobody to send it to: everyone in this group asked not to get emails, or there's nobody in it yet. Nothing was sent." };
  const appealId = await createAppeal({ charityId, userId: viewer.userId, subject: r.subject, body: r.body, audience: r.audience, pick });
  const p = await sendAppeal({ charityId, appealId, charityName: r.charity.name_en, replyTo: r.priv?.contact_email ?? null, userId: viewer.userId });
  revalidatePath(`/charity-admin/${charityId}/email-donors`);
  const done = await recordAction(charityId, viewer.userId, "appeal_sent", { subject: r.subject, sent: p?.sent ?? 0, waiting: p?.waiting ?? 0, failed: p?.failed ?? 0, skipped: p?.skipped ?? 0 }, null);
  redirect(`/charity-admin/${charityId}/email-donors?done=${done}`);
}

/** "Send the rest": carry on where a long send stopped. Never emails anyone twice. */
export async function continueAppeal(charityId: string, appealId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  const { charity, priv } = await loadCharityForManager(charityId);
  if (!(await isOwner(charityId))) return { ok: false, message: "Only your charity's owner can email your donors. Nothing was sent." };
  if (!/^[0-9a-f-]{36}$/i.test(appealId)) return { ok: false, message: "That email isn't there any more." };
  const p = await sendAppeal({ charityId, appealId, charityName: charity.name_en, replyTo: priv?.contact_email ?? null, userId: viewer.userId });
  if (!p) return { ok: false, message: "That email isn't there any more." };
  revalidatePath(`/charity-admin/${charityId}/email-donors`);
  return { ok: true, message: p.waiting ? `${p.sent} sent so far, ${p.waiting} still to send. Press Send the rest again.` : `All sent: ${p.sent} delivered to the email service.` };
}
