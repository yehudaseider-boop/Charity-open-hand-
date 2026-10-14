/**
 * Receipt settings. The receipt wording and printed fields are decided by the
 * attorney (Yosef), so they are kept here, in one place, and receipts cannot
 * be issued for real until they are confirmed.
 */
export const receiptConfig = {
  /**
   * DRAFT wording. Not confirmed by the attorney. Until RECEIPT_WORDING_CONFIRMED=yes
   * is set, receipts are previews only: they carry a DRAFT mark and the issuing
   * job refuses to write anything.
   */
  wording: {
    title: "Section 18A receipt",
    /** {charity} and {period} are filled in. */
    statement:
      "This receipt is issued by {charity} for the purposes of section 18A of the Income Tax Act, 1962, for the donations listed above, received during {period}.",
  },
  // Donor ID and tax numbers are printed as the last 4 digits only ("•••• 1234")
  // until the attorney says SARS requires the full number. Printing the full
  // number would mean decrypting it at issue time and keeping it in the receipt.
} as const;

export function receiptWordingConfirmed(): boolean {
  return process.env.RECEIPT_WORDING_CONFIRMED === "yes";
}

/** The job only writes real receipts when this is switched on (and the wording is confirmed). */
export function receiptsEnabled(): boolean {
  return process.env.RECEIPTS_ENABLED === "yes" && receiptWordingConfirmed();
}
