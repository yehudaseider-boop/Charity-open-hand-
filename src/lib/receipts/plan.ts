/**
 * Working out which annual s18A receipts are due. Pure: no database, no clock.
 *
 * One receipt per person (donor record plus the s18A identity typed at
 * checkout, so people sharing an email are never merged), per charity, per SARS tax year, covering every paid
 * donation that asked for an s18A receipt. The amount is the donations' gift
 * amounts only, never a contribution to Givezy, less any part of a gift that was refunded (20/11/2026). A gift
 * held for a person (an open dispute, a refund being reviewed) or refunded in full is left out, as
 * issue_s18a_receipt does. A gift paid while the charity couldn't issue s18A receipts (outside every one of its
 * approval periods) never goes on one, even once the charity can again (Yehuda, 23/11/2026).
 */

export type PlanDonation = {
  id: string;
  charityId: string;
  donorId: string;
  /** Fingerprint of the s18A identity typed with this donation ("" if none). */
  donorIdentity: string;
  taxYear: number;
  /** The gift as given. What a receipt counts is receiptableCents (less any part refunded). */
  amountCents: number;
  /** How much of the gift was refunded (partial refunds). Left out means none. */
  refundedCents?: number;
  /** Why a person must look before this gift is receipted ("dispute open", "refund being reviewed"); null or left out when it may be. */
  receiptHold?: string | null;
  status: string;
  wants18a: boolean;
  paidAt: string | null;
  /**
   * What the gift's s18A particulars still lack (the donor chose "Add my details after paying" and hasn't yet):
   * an SA ID or registration number, an address. Such a gift is not receiptable until they are added.
   */
  detailsMissing?: string[];
};

/** A stretch of time the charity could issue s18A receipts: from startedAt, up to (not including) endedAt; null while it still can. */
export type S18aPeriod = { startedAt: string; endedAt: string | null };

export type PlanCharity = {
  id: string;
  isS18a: boolean;
  mandateSignedAt: string | null;
  /** When the charity could issue s18A receipts (charity_s18a_periods). */
  s18aPeriods: S18aPeriod[];
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

export type Skipped = { donationId: string; reason: "not_paid" | "no_18a_requested" | "charity_cannot_issue" | "mandate_after_payment" | "already_receipted" | "late_after_receipt" | "wrong_year" | "details_missing"
  /** The charity declined this certificate (09/11/2026): left out of the run. */
  | "declined"
  /** The charity hasn't approved this certificate (or it changed since it did): left out of the run. */
  | "not_approved"
  /** Held for a person (an open dispute, a refund being reviewed, 20/11/2026): left out until they release it. */
  | "on_hold"
  /** Every cent of the gift was refunded in parts: nothing left to receipt. */
  | "fully_refunded"
  /** Paid while the charity couldn't issue s18A receipts (23/11/2026): never receipted, whatever happens later. */
  | "paid_outside_approval" };

/** What a receipt counts for one gift: the gift less any part of it that was refunded. Never below 0. */
export function receiptableCents(d: Pick<PlanDonation, "amountCents" | "refundedCents">): number {
  return Math.max(0, d.amountCents - (d.refundedCents ?? 0));
}

/** Can this charity issue s18A receipts: approval confirmed and a signed mandate. */
export function charityCanIssue(c: PlanCharity): boolean {
  return c.isS18a && c.mandateSignedAt !== null;
}

/**
 * Could the charity issue s18A receipts at this moment: inside one of its approval periods (the first moment
 * counts, the last doesn't), as charity_could_issue_18a_at in the database.
 */
export function paidInApprovalPeriod(periods: readonly S18aPeriod[], paidAt: string): boolean {
  const t = new Date(paidAt).getTime();
  if (Number.isNaN(t)) return false;
  return periods.some((p) => new Date(p.startedAt).getTime() <= t && (p.endedAt === null || t < new Date(p.endedAt).getTime()));
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
    if (d.receiptHold) { skip("on_hold"); continue; }
    if (receiptableCents(d) <= 0) { skip("fully_refunded"); continue; }
    const charity = charityById.get(d.charityId);
    if (!charity) { skip("charity_cannot_issue"); continue; }
    if (charity.mandateSignedAt && new Date(charity.mandateSignedAt).getTime() > new Date(d.paidAt).getTime()) { skip("mandate_after_payment"); continue; }
    // Paid while the charity couldn't issue: never on a receipt (checked before today's state, so such a gift is
    // never said to be "waiting" for the charity's approval).
    if (!paidInApprovalPeriod(charity.s18aPeriods, d.paidAt)) { skip("paid_outside_approval"); continue; }
    if (!charityCanIssue(charity)) { skip("charity_cannot_issue"); continue; }
    // Never a receipt without the required particulars: listed for the charity and Givezy as "details missing".
    if (d.detailsMissing?.length) { skip("details_missing"); continue; }
    if (receiptedGroups.has(groupKey(d))) { skip("late_after_receipt"); continue; }

    const key = groupKey(d);
    const g = groups.get(key) ?? { charityId: d.charityId, donorId: d.donorId, donorIdentity: d.donorIdentity, taxYear: args.taxYear, donationIds: [], totalCents: 0 };
    g.donationIds.push(d.id);
    g.totalCents += receiptableCents(d);
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
