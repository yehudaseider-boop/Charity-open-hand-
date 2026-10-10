import "server-only";
import { logAudit } from "@/lib/audit";
import { taxYearFor } from "@/lib/dates";
import { gatewayByName } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDonationPaid } from "./notify";

export type ConfirmOutcome = "paid" | "failed" | "pending" | "review" | "not_found";

/**
 * Ask the gateway whether a payment went through and record the answer.
 * Safe to call any number of times (webhook, return page, retries): a
 * donation only moves pending -> paid/failed once.
 */
export async function confirmPayment(reference: string): Promise<ConfirmOutcome> {
  if (!/^[0-9a-f-]{36}$/i.test(reference)) return "not_found";
  const db = createAdminClient();
  const { data: donation } = await db
    .from("donations")
    .select("id, status, gateway, total_charged_cents")
    .eq("gateway_ref", reference)
    .maybeSingle();
  if (!donation) return "not_found";
  if (donation.status === "paid") return "paid";
  if (donation.status !== "pending" && donation.status !== "failed") return donation.status as ConfirmOutcome;

  const tx = await gatewayByName(donation.gateway).verifyTransaction(reference);

  if (tx.status === "success") {
    if (tx.currency !== "ZAR" || tx.amountCents !== Number(donation.total_charged_cents)) {
      await logAudit({
        actorUserId: null,
        action: "donation.amount_mismatch",
        entityType: "donation",
        entityId: donation.id,
        details: { expected: donation.total_charged_cents, got: tx.amountCents, currency: tx.currency },
      });
      return "review";
    }
    const paidAt = tx.paidAt ? new Date(tx.paidAt) : new Date();
    const { data: updated } = await db
      .from("donations")
      .update({ status: "paid", paid_at: paidAt.toISOString(), tax_year: taxYearFor(paidAt) })
      .eq("id", donation.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (updated?.length) await notifyDonationPaid(donation.id);
    return "paid";
  }

  if (tx.status === "failed" && donation.status === "pending") {
    await db
      .from("donations")
      .update({ status: "failed", failed_at: new Date().toISOString() })
      .eq("id", donation.id)
      .eq("status", "pending");
    return "failed";
  }
  return donation.status === "failed" ? "failed" : "pending";
}
