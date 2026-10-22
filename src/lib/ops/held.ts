/** What each held item is, in plain words. */
export const heldLabel: Record<string, string> = {
  "donation.amount_mismatch": "Amount did not match",
  "webhook.unmatched_payment": "Payment with no matching donation",
  "donation.refund_review": "Refund to check (partial, the amount was not given, or it came before the payment was confirmed)",
  "donation.gateway_mismatch": "Payment on a payment provider we no longer use: check it there",
  "refund.unmatched": "Refund for a payment we could not find",
  "donation.dispute_opened": "Dispute (chargeback) opened",
  "donation.dispute_resolved": "Dispute resolved: check who won",
  "monthly.paid_twice": "A monthly donation was paid twice for one month: refund one of the two payments",
  "receipt.needs_reissue": "An issued s18A receipt includes a refunded or charged-back donation: void and re-issue it",
};
