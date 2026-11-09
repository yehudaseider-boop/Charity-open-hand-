"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { recordAction } from "@/lib/charity/charity-actions";
import { loadCharityForManager } from "@/lib/charity/queries";
import { canIssue18a } from "@/lib/charities";
import type { FormState } from "@/lib/form";
import { formatRand } from "@/lib/money";
import { approveRun, cancelRun, closedTaxYears } from "@/lib/receipts/runs";
import { approveCertificate, declineCertificate, editCertificate, reopenCertificate, reviewFailureText, type Certificate } from "@/lib/receipts/review-store";
import { formToObject } from "@/lib/form";

/** The charity approves the list of s18A receipts it was shown for a closed tax year. */
export async function approveReceipts(charityId: string, taxYear: number, fingerprint: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  // Throws unless the signed-in person (with their second step) manages this charity.
  const { charity } = await loadCharityForManager(charityId);
  if (!canIssue18a(charity)) return { ok: false, message: "Your charity can't issue s18A receipts yet: it needs confirmed s18A approval and a signed receipting mandate." };
  if (!closedTaxYears(new Date()).includes(taxYear)) return { ok: false, message: "Receipts for that tax year can't be approved here. Nothing was changed." };
  const r = await approveRun({ charityId, taxYear, fingerprint, userId: viewer.userId });
  revalidatePath(`/charity-admin/${charityId}/receipts`);
  if (!r.ok) {
    if (r.why === "changed") return { ok: false, message: "The list changed while you were looking at it (a gift was paid or refunded, or someone at your charity decided on a receipt). Nothing was approved. The page now shows the new list: check it and approve again." };
    if (r.why === "open") return { ok: false, message: "Someone at your charity has just approved this list. Nothing more to do: it's waiting for Givezy to sign it off." };
    return { ok: false, message: "There are no receipts left to approve for that tax year (any left are declined). Nothing was changed." };
  }
  const done = await recordAction(charityId, viewer.userId, "receipts_approved", { taxYear, receipts: r.run.receipts_planned, total: formatRand(r.run.total_cents) }, { type: "cancel_receipt_run", id: r.run.id, decisionIds: r.approvedNow });
  redirect(`/charity-admin/${charityId}/receipts?done=${done}`);
}

/** Withdraw an approval Givezy hasn't signed off yet. It can be approved again afterwards. */
export async function withdrawReceipts(charityId: string, runId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  await loadCharityForManager(charityId);
  const ok = await cancelRun({ runId, charityId, userId: viewer.userId, reason: "The charity took back its approval." });
  revalidatePath(`/charity-admin/${charityId}/receipts`);
  if (!ok) return { ok: false, message: "Givezy has already signed it off, so the receipts are issued. If one is wrong, tell us: only we can withdraw and re-issue a receipt." };
  return { ok: true, message: "Your approval is withdrawn. Nothing will be issued. You can approve the list again when you're ready." };
}

/**
 * The charity's check of one planned s18A receipt (09/11/2026). The same people as "Approve all": anyone who
 * manages the charity (owner or admin; roles come in CRM step 9), with their second step. Each one checks the
 * charity, the tax year and the certificate again on the server; the page's buttons decide nothing.
 */
async function reviewer(charityId: string, taxYear: number) {
  const viewer = await requireViewer();
  // Throws (not found) unless the signed-in person manages this charity: another charity's admin gets nothing.
  const { charity, priv } = await loadCharityForManager(charityId);
  if (!canIssue18a(charity)) return { error: "Your charity can't issue s18A receipts yet: it needs confirmed s18A approval and a signed receipting mandate." } as const;
  if (!closedTaxYears(new Date()).includes(taxYear)) return { error: "Receipts for that tax year can't be checked here. Nothing was changed." } as const;
  return { viewer, priv } as const;
}

/** What the "what just happened" panel needs about the next receipt to check. */
const nextOf = (cert: Certificate) => (cert.next ? { nextKey: cert.next.key, nextName: cert.next.donorName } : {});
const back = (charityId: string, taxYear: number, done: string) => `/charity-admin/${charityId}/receipts?done=${done}#year-${taxYear}`;

export async function approveCertificateAction(charityId: string, taxYear: number, key: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const who = await reviewer(charityId, taxYear);
  if ("error" in who) return { ok: false, message: who.error };
  const r = await approveCertificate({ charityId, taxYear, key, userId: who.viewer.userId });
  revalidatePath(`/charity-admin/${charityId}/receipts`);
  if (!r.ok) return { ok: false, message: reviewFailureText(r.why) };
  const done = await recordAction(
    charityId, who.viewer.userId, "certificate_approved",
    { taxYear, key, name: r.cert.donorName, total: formatRand(r.cert.receipt.totalCents), ...nextOf(r.cert) },
    { type: "receipt_decision", taxYear, remove: { id: r.decisionId, decidedAt: r.decidedAt }, reinsert: r.previous },
  );
  redirect(back(charityId, taxYear, done));
}

export async function declineCertificateAction(charityId: string, taxYear: number, key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const who = await reviewer(charityId, taxYear);
  if ("error" in who) return { ok: false, message: who.error };
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const r = await declineCertificate({ charityId, taxYear, key, userId: who.viewer.userId, note, contact: { phone: who.priv?.contact_phone ?? null, email: who.priv?.contact_email ?? null } });
  revalidatePath(`/charity-admin/${charityId}/receipts`);
  if (!r.ok) return { ok: false, message: reviewFailureText(r.why) };
  // Can't be taken back (the email went): the page asked first. A declined receipt can be reopened instead.
  const done = await recordAction(
    charityId, who.viewer.userId, "certificate_declined",
    { taxYear, key, name: r.cert.donorName, emailed: r.emailed, phone: who.priv?.contact_phone ?? "", email: who.priv?.contact_email ?? "", ...nextOf(r.cert) },
    null,
  );
  redirect(back(charityId, taxYear, done));
}

export async function reopenCertificateAction(charityId: string, taxYear: number, key: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const who = await reviewer(charityId, taxYear);
  if ("error" in who) return { ok: false, message: who.error };
  const r = await reopenCertificate({ charityId, taxYear, key, userId: who.viewer.userId });
  revalidatePath(`/charity-admin/${charityId}/receipts`);
  if (!r.ok) return { ok: false, message: reviewFailureText(r.why) };
  const done = await recordAction(
    charityId, who.viewer.userId, "certificate_reopened",
    { taxYear, key, name: r.cert.donorName, was: String(r.removed.decision ?? "") },
    { type: "receipt_decision", taxYear, reinsert: r.removed },
  );
  redirect(back(charityId, taxYear, done));
}

export async function editCertificateAction(charityId: string, taxYear: number, key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const who = await reviewer(charityId, taxYear);
  if ("error" in who) return { ok: false, message: who.error };
  const r = await editCertificate({ charityId, taxYear, key, userId: who.viewer.userId, input: formToObject(formData) });
  revalidatePath(`/charity-admin/${charityId}/receipts`);
  if (!r.ok) return { ok: false, message: reviewFailureText(r.why), fieldErrors: r.fieldErrors };
  const changed = r.changed.length === 2 ? "name and address" : r.changed[0] ?? "details";
  const done = await recordAction(
    charityId, who.viewer.userId, r.changed.length ? "certificate_edited" : "certificate_approved",
    { taxYear, key, name: r.name, changed, total: formatRand(r.cert.receipt.totalCents), ...nextOf(r.cert) },
    { type: "receipt_decision", taxYear, remove: { id: r.decisionId, decidedAt: r.decidedAt }, reinsert: r.previous, restore: r.restore as { donationId: string; before: Record<string, string | null>; after: Record<string, string | null> }[] },
  );
  redirect(back(charityId, taxYear, done));
}
