/**
 * Working out which annual s18A receipts are due. Pure: no database, no clock.
 *
 * One receipt per person (donor record plus the s18A identity typed at
 * checkout, so people sharing an email are never merged), per charity, per SARS tax year, covering every paid
 * donation that asked for an 18A receipt. The amount is the donations' gift
 * amounts only, never the processing fee.
 */

export type PlanDonation = {
  id: string;
  charityId: string;
  donorId: string;
  /** Fingerprint of the s18A identity typed with this donation ("" if none). */
  donorIdentity: string;
  taxYear: number;
  amountCents: number;
  status: string;
  wants18a: boolean;
  paidAt: string | null;
};

export type PlanCharity = {
  id: string;
  isS18a: boolean;
  mandateSignedAt: string | null;
};

export type PlannedReceipt = {
  charityId: string;
  donorId: string;
  donorIdentity: string;
  taxYear: number;
  donationIds: string[];
  totalCents: number;
};

export type Skipped = { donationId: string; reason: "not_paid" | "no_18a_requested" | "charity_cannot_issue" | "mandate_after_payment" | "already_receipted" | "wrong_year" };

/** Can this charity issue s18A receipts: approval confirmed and a signed mandate. */
export function charityCanIssue(c: PlanCharity): boolean {
  return c.isS18a && c.mandateSignedAt !== null;
}

/** Is a SARS tax year over, so its receipts can be issued? `today` is yyyy-mm-dd in Johannesburg time. */
export function taxYearIsClosed(taxYearEnd: string, today: string): boolean {
  return today > taxYearEnd;
}

export function planReceipts(args: {
  taxYear: number;
  donations: PlanDonation[];
  charities: PlanCharity[];
  /** Donation ids already on an issued receipt. */
  alreadyReceipted: Set<string>;
}): { receipts: PlannedReceipt[]; skipped: Skipped[] } {
  const charityById = new Map(args.charities.map((c) => [c.id, c]));
  const groups = new Map<string, PlannedReceipt>();
  const skipped: Skipped[] = [];

  for (const d of args.donations) {
    const skip = (reason: Skipped["reason"]) => skipped.push({ donationId: d.id, reason });
    if (d.taxYear !== args.taxYear) { skip("wrong_year"); continue; }
    if (d.status !== "paid" || !d.paidAt) { skip("not_paid"); continue; }
    if (!d.wants18a) { skip("no_18a_requested"); continue; }
    if (args.alreadyReceipted.has(d.id)) { skip("already_receipted"); continue; }
    const charity = charityById.get(d.charityId);
    if (!charity || !charityCanIssue(charity)) { skip("charity_cannot_issue"); continue; }
    if (new Date(charity.mandateSignedAt!).getTime() > new Date(d.paidAt).getTime()) { skip("mandate_after_payment"); continue; }

    const key = `${d.charityId}|${d.donorId}|${d.donorIdentity}`;
    const g = groups.get(key) ?? { charityId: d.charityId, donorId: d.donorId, donorIdentity: d.donorIdentity, taxYear: args.taxYear, donationIds: [], totalCents: 0 };
    g.donationIds.push(d.id);
    g.totalCents += d.amountCents;
    groups.set(key, g);
  }
  return { receipts: [...groups.values()], skipped };
}
