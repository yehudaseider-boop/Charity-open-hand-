"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth";
import type { FormState } from "@/lib/form";
import { formatRand } from "@/lib/money";
import { cancelRun, finishRun, signOffRun, type SignOffResult } from "@/lib/receipts/runs";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Withdraw an issued receipt (a wrong address, a refunded donation, and so on).
 * The receipt is kept, marked void with the reason; it is never deleted. Its
 * donations are then free to go on a new receipt: the charity's receipts page
 * lists the donor again, and a replacement is issued once it is approved and signed off.
 */
export async function voidReceipt(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Receipt not found." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Give a reason for the record" } };

  const { data, error } = await createAdminClient()
    .from("s18a_receipts")
    .update({ status: "void", voided_at: new Date().toISOString(), void_reason: reason.slice(0, 2000) })
    .eq("id", id)
    .eq("status", "issued")
    .select("id, details");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Only an issued receipt can be withdrawn." };

  await logAudit({
    actorUserId: admin.userId,
    action: "receipt.voided",
    entityType: "s18a_receipt",
    entityId: id,
    details: { reason, reference: (data[0].details as { receipt_reference?: string }).receipt_reference },
  });
  revalidatePath("/admin/receipts");
  return { ok: true, message: "Withdrawn. The charity's receipts page now lists this donor again: a replacement is issued once the charity approves it and you sign it off." };
}

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function resultText(r: SignOffResult, what: "issued" | "finished"): FormState {
  if (!r.ok) {
    switch (r.why) {
      case "switched_off":
        return { ok: false, message: "Receipts are switched off (RECEIPTS_ENABLED and RECEIPT_WORDING_CONFIRMED, after the attorney confirms the wording). Nothing was issued." };
      case "changed":
        return { ok: false, message: "The list changed after the charity approved it (a refund or a late payment), so nothing was issued. It has gone back to the charity to check again." };
      case "gone":
        return { ok: false, message: "This run is no longer waiting: someone else may have signed it off or it was taken back. Nothing more was done." };
      default:
        return { ok: false, message: r.message ?? "Something went wrong. Nothing more was done." };
    }
  }
  const s = r.summary;
  const parts = [
    what === "issued" ? `${s.issued} of ${s.planned} receipts issued` : "Finished",
    `${s.pdfsMade} PDFs made`,
    r.emailed ? `${s.emailed} emailed` : "nothing emailed (SITE_URL is not set)",
  ];
  const problems = s.failed.length + s.emailFailed;
  return {
    ok: problems === 0,
    message: `${parts.join(", ")}.${problems ? ` ${problems} ${problems === 1 ? "step" : "steps"} failed: ${s.failed.map((f) => f.message).slice(0, 3).join("; ")}${s.emailFailed ? `${s.failed.length ? "; " : ""}${s.emailFailed} emails` : ""}. Everything else is done. Use "Finish" to try those again.` : ""}`,
  };
}

/** Givezy's sign-off on a list a charity approved: issue, make the PDFs and email them. */
export async function signOffReceipts(runId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isId(runId)) return { ok: false, message: "Run not found." };
  const r = await signOffRun({ runId, userId: admin.userId });
  revalidatePath("/admin/receipts");
  // Done, or sent back because the list changed: the page says what happened from the run's own
  // record, so it survives the refresh (the run leaves the waiting list either way).
  if (r.ok || r.why === "changed") redirect(`/admin/receipts?run=${runId}`);
  return resultText(r, "issued");
}

/** Make PDFs and send emails still missing for a finished run. Issues nothing new. */
export async function finishReceipts(runId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isId(runId)) return { ok: false, message: "Run not found." };
  const r = await finishRun({ runId, userId: admin.userId });
  revalidatePath("/admin/receipts");
  if (r.ok) redirect(`/admin/receipts?run=${runId}`);
  return resultText(r, "finished");
}

/** Send a list back to the charity, with the reason it sees. */
export async function sendBackReceipts(runId: string, totalCents: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requirePlatformAdmin();
  if (!isId(runId)) return { ok: false, message: "Run not found." };
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < 5) return { ok: false, fieldErrors: { reason: "Tell the charity why, in a few words" } };
  const ok = await cancelRun({ runId, userId: admin.userId, reason: reason.slice(0, 300) });
  revalidatePath("/admin/receipts");
  if (!ok) return { ok: false, message: "This run is no longer waiting for sign-off. Nothing was changed." };
  return { ok: true, message: `Sent back. The charity sees your reason and the list (${formatRand(totalCents)}) to approve again.` };
}
