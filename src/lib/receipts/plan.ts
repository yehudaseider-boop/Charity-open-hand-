/**
 * Working out which annual s18A receipts are due. Pure: no database, no clock.
 *
 * One receipt per person (donor record plus the s18A identity typed at
 * checkout, so people sharing an email are never merged), per charity, per SARS tax year, covering every paid
 * donation that asked for an s18A receipt. The amount is the donations' gift
 * amounts only, never a contribution to Givezy.
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

/**
 * One donor record getting more than one receipt from a charity in a year, because different ID or tax
 * numbers were typed. Two people sharing an email look exactly the same, so these are issued and listed for
 * a person to check: if it is one person, void them and issue one.
 */
export type SeveralIdentities = { charityId: string; donorId: string; taxYear: number; receipts: number };

export type Skipped = { donationId: string; reason: "not_paid" | "no_18a_requested" | "charity_cannot_issue" | "mandate_after_payment" | "already_receipted" | "late_after_receipt" | "wrong_year" };

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
}): { receipts: PlannedReceipt[]; skipped: Skipped[]; severalIdentities: SeveralIdentities[] } {
  const charityById = new Map(args.charities.map((c) => [c.id, c]));
  const groups = new Map<string, PlannedReceipt>();
  const skipped: Skipped[] = [];

  // A person who already has an issued receipt for the year cannot get a second one
  // (the database refuses it). A donation confirmed after that receipt was issued is
  // left for a person: void the receipt and issue it again with the late donation on it.
  const groupKey = (d: PlanDonation) => `${d.charityId}|${d.donorId}|${d.donorIdentity}`;
  const receiptedGroups = new Set(args.donations.filter((d) => d.taxYear === args.taxYear && args.alreadyReceipted.has(d.id)).map(groupKey));

  for (const d of args.donations) {
    const skip = (reason: Skipped["reason"]) => skipped.push({ donationId: d.id, reason });
    if (d.taxYear !== args.taxYear) { skip("wrong_year"); continue; }
    if (d.status !== "paid" || !d.paidAt) { skip("not_paid"); continue; }
    if (!d.wants18a) { skip("no_18a_requested"); continue; }
    if (args.alreadyReceipted.has(d.id)) { skip("already_receipted"); continue; }
    const charity = charityById.get(d.charityId);
    if (!charity || !charityCanIssue(charity)) { skip("charity_cannot_issue"); continue; }
    if (new Date(charity.mandateSignedAt!).getTime() > new Date(d.paidAt).getTime()) { skip("mandate_after_payment"); continue; }
    if (receiptedGroups.has(groupKey(d))) { skip("late_after_receipt"); continue; }

    const key = groupKey(d);
    const g = groups.get(key) ?? { charityId: d.charityId, donorId: d.donorId, donorIdentity: d.donorIdentity, taxYear: args.taxYear, donationIds: [], totalCents: 0 };
    g.donationIds.push(d.id);
    g.totalCents += d.amountCents;
    groups.set(key, g);
  }
  const perDonor = new Map<string, SeveralIdentities>();
  for (const g of groups.values()) {
    const k = `${g.charityId}|${g.donorId}`;
    const e = perDonor.get(k) ?? { charityId: g.charityId, donorId: g.donorId, taxYear: g.taxYear, receipts: 0 };
    e.receipts += 1;
    perDonor.set(k, e);
  }
  return { receipts: [...groups.values()], skipped, severalIdentities: [...perDonor.values()].filter((e) => e.receipts > 1) };
}
