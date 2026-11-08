import { isValidSaIdNumber } from "@/lib/sa-id";

/**
 * Adding an SA ID number to a monthly donation set up before 03/11/2026 with only an income tax number
 * (decided 03/11/2026: nudge those donors on the account page, keep s18A on their gifts). SARS's IT3(d)
 * report does not accept a donor with only a tax number, so every new monthly gift (which copies the
 * first gift's details) would carry a receipt that cannot be reported.
 *
 * The rules of who is asked and which gifts are updated live here, with no database, so they can be tested.
 */

export const NUDGE_TEXT =
  "Add your SA ID number so your s18A receipts for this monthly donation can be reported to SARS. Your income tax number alone is no longer enough.";
export const SAVED_TEXT = "Saved. From now on your monthly gifts carry your ID number, and this tax year's gifts have been updated.";
export const CONFIRM_TEXT = "This replaces the details on your monthly donation. Continue?";

export type MonthlyForNudge = {
  status: string;
  wants_18a: boolean | null;
  first_donation_id: string | null;
};

export type SourceDetails = {
  donor_type: string;
  id_number_encrypted: string | null;
  tax_reference_encrypted: string | null;
  address_line1: string | null;
  erased_at?: string | null;
};

/**
 * A live (active or paused) s18A monthly donation of an individual whose details carry an income tax number but no
 * ID number. Not one set up with "Add my details after paying" (no ID number, no tax number, or no address): the
 * account page's "s18A details still needed" asks for those, so one gift never shows two ID forms.
 */
export function needsIdNudge(m: MonthlyForNudge, details: SourceDetails | null | undefined): boolean {
  if (m.status !== "active" && m.status !== "paused") return false;
  if (!m.wants_18a || !m.first_donation_id) return false;
  if (!details || details.erased_at) return false;
  if (!details.tax_reference_encrypted || !details.address_line1?.trim()) return false;
  return details.donor_type === "individual" && !details.id_number_encrypted;
}

/** The ID number as typed, cleaned, or a plain reason it was refused. */
export function cleanSaIdNumber(raw: unknown): { ok: true; id: string } | { ok: false; message: string } {
  const typed = typeof raw === "string" ? raw.replace(/\s/g, "") : "";
  if (!typed) return { ok: false, message: "Enter your SA ID number. SARS needs it for an s18A receipt" };
  if (!isValidSaIdNumber(typed)) return { ok: false, message: "That doesn't look like a valid SA ID number" };
  return { ok: true, id: typed };
}

export type GiftForUpdate = {
  id: string;
  recurring_id: string | null;
  donor_id: string;
  status: string;
  tax_year: number | null;
};

/**
 * Which of a monthly donation's gifts get the new ID number: this donation's own paid gifts of the current
 * tax year that belong to the signed-in person's donor records and are not on an issued s18A receipt. A
 * gift on an issued receipt is never changed: the receipt is what it was issued as.
 */
export function giftsToUpdate(
  gifts: GiftForUpdate[],
  scope: { recurringId: string; donorIds: ReadonlySet<string>; taxYear: number; onIssuedReceipt: ReadonlySet<string> },
): string[] {
  return gifts
    .filter(
      (g) =>
        g.recurring_id === scope.recurringId &&
        scope.donorIds.has(g.donor_id) &&
        g.status === "paid" &&
        g.tax_year === scope.taxYear &&
        !scope.onIssuedReceipt.has(g.id),
    )
    .map((g) => g.id);
}
