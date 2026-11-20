"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { clearReceiptHold, recordPartialRefund, releaseDisputeHold, reverseDonation, type ReverseKind } from "@/lib/donations/reverse";
import type { FormState } from "@/lib/form";
import { isUuid } from "@/lib/ids";
import { COMMA_THOUSANDS_MESSAGE, formatRand, looksLikeAmount, parseRandToCents, usesCommaThousands } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";

/** A platform admin marks a paid donation refunded or charged back, after checking it in the gateway's dashboard. Logged. */
export async function markDonation(donationId: string, kind: ReverseKind): Promise<void> {
  const viewer = await requirePlatformAdmin();
  if (!isUuid(donationId) || (kind !== "refunded" && kind !== "charged_back")) return;
  await reverseDonation(donationId, kind, viewer.userId, "marked by a platform admin");
  revalidatePath("/admin/payments");
}

/** A dispute was won: the donor may resume the monthly donation it paused, and the gift may be receipted. Checked in the gateway first. Logged. */
export async function releaseHold(donationId: string): Promise<void> {
  const viewer = await requirePlatformAdmin();
  if (!isUuid(donationId)) return;
  await releaseDisputeHold(donationId, viewer.userId);
  revalidatePath("/admin/payments");
}

/** A held gift was checked: it may go on an s18A receipt again. Logged. */
export async function clearHold(donationId: string): Promise<void> {
  const viewer = await requirePlatformAdmin();
  if (!isUuid(donationId)) return;
  await clearReceiptHold(donationId, viewer.userId);
  revalidatePath("/admin/payments");
}

/**
 * A platform admin records the part of a paid gift that was refunded, in Rand, after checking it in the gateway's
 * dashboard. Never more than what is left of the gift. `entry` is fresh each time the page is shown, so pressing
 * the button twice records it once. Logged.
 */
export async function recordPartRefund(donationId: string, entry: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requirePlatformAdmin();
  if (!isUuid(donationId) || !isUuid(entry)) return { ok: false, message: "This form is out of date. Refresh the page and try again." };
  const typed = String(formData.get("amount") ?? "").trim();
  const wrong = (message: string): FormState => ({ ok: false, message: "Please fix the amount.", fieldErrors: { amount: message } });
  if (!typed) return wrong("Type the part of the gift that was refunded, for example 400 or 400.50");
  if (usesCommaThousands(typed)) return wrong(COMMA_THOUSANDS_MESSAGE);
  const cents = parseRandToCents(typed);
  if (cents === null) return wrong(looksLikeAmount(typed) ? "That amount is too big" : "Type an amount in Rand, for example 400 or 400.50");
  if (cents <= 0) return wrong("The amount must be more than R0");

  const { data: d, error } = await createAdminClient().from("donations").select("status, amount_cents, refunded_cents").eq("id", donationId).maybeSingle();
  if (error) throw error;
  if (!d) return { ok: false, message: "We couldn't find this donation. Nothing was recorded." };
  if (d.status !== "paid") return { ok: false, message: `This donation is now ${String(d.status).replace("_", " ")}, so nothing was recorded.` };
  const left = Number(d.amount_cents) - Number(d.refunded_cents);
  if (cents > left) return wrong(`That is more than what is left of the gift (${formatRand(left)})`);

  const outcome = await recordPartialRefund(donationId, cents, `admin:${entry}`, viewer.userId, "recorded by a platform admin");
  revalidatePath("/admin/payments");
  if (outcome === "done") return { ok: true, message: `Recorded. ${formatRand(left - cents)} of the gift is left for the s18A receipt.` };
  if (outcome === "already") return { ok: true, message: "This was already recorded. Nothing more was changed." };
  if (outcome === "too_much") return wrong("That is more than what is left of the gift. Refresh the page to see the latest amount");
  if (outcome === "not_paid") return { ok: false, message: "This donation is no longer paid, so nothing was recorded." };
  return { ok: false, message: "We couldn't find this donation. Nothing was recorded." };
}
