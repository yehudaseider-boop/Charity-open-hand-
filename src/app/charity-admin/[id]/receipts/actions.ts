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
    if (r.why === "changed") return { ok: false, message: "The list changed while you were looking at it (a gift was paid, refunded or withdrawn). Nothing was approved. The page now shows the new list: check it and approve again." };
    if (r.why === "open") return { ok: false, message: "Someone at your charity has just approved this list. Nothing more to do: it's waiting for Givezy to sign it off." };
    return { ok: false, message: "There are no receipts left to approve for that tax year. Nothing was changed." };
  }
  const done = await recordAction(charityId, viewer.userId, "receipts_approved", { taxYear, receipts: r.run.receipts_planned, total: formatRand(r.run.total_cents) }, { type: "cancel_receipt_run", id: r.run.id });
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
