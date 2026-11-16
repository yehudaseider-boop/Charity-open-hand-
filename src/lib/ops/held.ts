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
  "charity.public_name_changed": "An approved charity changed its public name: check it is still the same charity",
  "monthly.charge_error": "A monthly collection could not be sent to the payment provider (not a declined card; the donor was not emailed). It is checked again on the next run: see the job log",
  "monthly.try_unconfirmed": "A monthly collection try the payment provider never received (or that was abandoned there) was counted as missed and the normal retry follows. The donor was not told their card was declined, and the card is kept",
  "monthly.waiting_on_provider": "A monthly collection is still waiting for the payment provider after 48 hours: nothing more is charged for that monthly donation until it is settled. Check it at the payment provider",
  "receipt.needs_reissue": "An issued s18A receipt includes a refunded or charged-back donation: void and re-issue it",
};
