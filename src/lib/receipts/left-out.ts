/**
 * Paid s18A gifts the yearly run leaves off a donor's receipt for now, other than for missing details (those have
 * their own list): on hold, paid after the donor's receipt was issued, paid before the charity's receipting
 * mandate was signed, or paid while the charity couldn't issue s18A receipts (23/11/2026). Without saying so, a donor could look forgotten (review 21/11/2026). Givezy's admin page and
 * the charity's receipts page use the same reasons; each says what happens next in its own words. Pure.
 */
import type { PlanDonation, Skipped } from "./plan";
import { receiptableCents } from "./plan";

/** In the order they are shown. */
export const LEFT_OUT_REASONS = ["on_hold", "late_after_receipt", "mandate_after_payment", "paid_outside_approval", "charity_cannot_issue"] as const;
export type LeftOutReason = (typeof LEFT_OUT_REASONS)[number];

export const isLeftOutReason = (r: string): r is LeftOutReason => (LEFT_OUT_REASONS as readonly string[]).includes(r);

/** For Givezy's admin page: what each reason is, and what Givezy does about it. Follows "3 gifts ". */
export const ADMIN_LEFT_OUT_WORDS: Record<LeftOutReason, string> = {
  on_hold: "on hold (a dispute or a refund to check)",
  late_after_receipt: "paid after the donor's receipt was issued (withdraw that receipt and issue it again)",
  mandate_after_payment: "paid before the charity signed its receipting mandate",
  paid_outside_approval: "paid while the charity couldn't issue s18A receipts (never receipted)",
  charity_cannot_issue: "the charity can't receipt now (no s18A approval or mandate)",
};

/** For the charity's receipts page: what happened, in plain words, and what happens next. */
export const CHARITY_LEFT_OUT_WORDS: Record<LeftOutReason, { what: string; next: string }> = {
  on_hold: {
    what: "On hold while a refund or dispute is checked",
    next: "It goes on the donor's receipt once Givezy clears it.",
  },
  late_after_receipt: {
    what: "Paid after the donor's receipt was issued",
    next: "Givezy withdraws that receipt and issues it again with this gift on it.",
  },
  mandate_after_payment: {
    what: "Paid before your receipting mandate was signed",
    next: "Givezy can't put it on an s18A receipt, because your mandate wasn't signed yet when it was paid.",
  },
  paid_outside_approval: {
    what: "Paid while you couldn't issue s18A receipts",
    next: "Givezy can't put it on an s18A receipt, because your s18A approval or mandate wasn't in place when it was paid.",
  },
  charity_cannot_issue: {
    what: "Waiting for your s18A approval or signed mandate",
    next: "It was paid while you could issue s18A receipts, so it goes on a receipt once both are confirmed again.",
  },
};

export type LeftOutGroup = { reason: LeftOutReason; donationIds: string[]; amountCents: number };

/**
 * The left-out gifts of one plan, grouped by reason, in LEFT_OUT_REASONS order, with what each group would count on a
 * receipt (the gift less any part refunded). Reasons with no gifts are left out.
 */
export function groupLeftOut(skipped: Skipped[], donations: Pick<PlanDonation, "id" | "amountCents" | "refundedCents">[]): LeftOutGroup[] {
  const byId = new Map(donations.map((d) => [d.id, d]));
  const groups = new Map<LeftOutReason, LeftOutGroup>();
  for (const s of skipped) {
    if (!isLeftOutReason(s.reason)) continue;
    const g = groups.get(s.reason) ?? { reason: s.reason, donationIds: [], amountCents: 0 };
    g.donationIds.push(s.donationId);
    const d = byId.get(s.donationId);
    g.amountCents += d ? receiptableCents(d) : 0;
    groups.set(s.reason, g);
  }
  return LEFT_OUT_REASONS.flatMap((r) => (groups.has(r) ? [groups.get(r)!] : []));
}
