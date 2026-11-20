/**
 * The money columns of the charity's donations download (code review, 20/11/2026). Pure: no database.
 * Amount is what is left of the gift after any part refund, so adding up a paid download gives the income received
 * (as the dashboard and the s18A receipt count it). Refunded is what was refunded of the gift in part refunds.
 */
import { centsToPlain } from "@/lib/csv";
import { leftCents, partRefundedCents, type GiftAmount } from "@/lib/donations/what-is-left";

/** [Amount (R), Refunded (R)] for one gift, as plain Rand with cents ("600.00", "400.00"). */
export function donationAmountColumns(d: Pick<GiftAmount, "amount_cents" | "refunded_cents">): [string, string] {
  return [centsToPlain(leftCents(d)), centsToPlain(partRefundedCents(d))];
}
