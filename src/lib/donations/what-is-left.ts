/**
 * What is left of a gift after part refunds (code review, 20/11/2026). A part refund leaves the gift 'paid' and
 * grows refunded_cents (cents of the gift itself, never the contribution to Givezy or the card charge). Every money
 * view counts what is left, as the s18A receipt does; a paid gift with nothing left counts as a refund, not a gift.
 * Pure: no database.
 */
import { formatRand } from "@/lib/money";

export type GiftAmount = { status: string; amount_cents: number | string; refunded_cents?: number | string | null };

/** Cents of the gift refunded in part refunds (0 when none). */
export const partRefundedCents = (g: Pick<GiftAmount, "refunded_cents">): number => Number(g.refunded_cents ?? 0);

/** The gift less any part of it refunded. Never below 0. */
export const leftCents = (g: Pick<GiftAmount, "amount_cents" | "refunded_cents">): number =>
  Math.max(0, Number(g.amount_cents) - partRefundedCents(g));

/** A paid gift with something left: what counts as a gift in totals, gift counts and donor counts. */
export const countsAsGift = (g: GiftAmount): boolean => g.status === "paid" && leftCents(g) > 0;

/**
 * Part refunds took the whole gift: nothing is left. For reads already narrowed to paid gifts (who to email, who gave):
 * such a gift is no gift (21/11/2026). A gift with no part refunds is never "nothing left".
 */
export const nothingLeft = (g: Pick<GiftAmount, "amount_cents" | "refunded_cents">): boolean => partRefundedCents(g) > 0 && leftCents(g) === 0;

/** A paid gift refunded in full by part refunds: counted as a refund, like a refunded gift. */
export const refundedInParts = (g: GiftAmount): boolean => g.status === "paid" && nothingLeft(g);

/** Plain words for a gift that was partly refunded, under what is left: "R1 000, R400 refunded". Null when none was. */
export function partRefundNote(g: Pick<GiftAmount, "amount_cents" | "refunded_cents">): string | null {
  const refunded = partRefundedCents(g);
  return refunded > 0 ? `${formatRand(Number(g.amount_cents))}, ${formatRand(refunded)} refunded` : null;
}
