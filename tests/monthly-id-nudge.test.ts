/** Adding an SA ID number to a monthly s18A gift set up with only a tax number (03/11/2026): who is asked, and which gifts change. */
import { describe, expect, it } from "vitest";
import { cleanSaIdNumber, giftsToUpdate, needsIdNudge, NUDGE_TEXT, SAVED_TEXT, CONFIRM_TEXT, withCarriedId } from "@/lib/donations/monthly-id-nudge";

const live = { status: "active", wants_18a: true, first_donation_id: "d-first" };
const noId = { donor_type: "individual", id_number_encrypted: null, tax_reference_encrypted: "v1.tax", address_line1: "5 Rissik Street", erased_at: null };

describe("who is asked for an ID number", () => {
  it("an active or paused s18A monthly donation of an individual with no ID number", () => {
    expect(needsIdNudge(live, noId)).toBe(true);
    expect(needsIdNudge({ ...live, status: "paused" }, noId)).toBe(true);
  });
  it("not when stopped, cancelled, without s18A, or without a first gift to copy from", () => {
    expect(needsIdNudge({ ...live, status: "failed" }, noId)).toBe(false);
    expect(needsIdNudge({ ...live, status: "cancelled" }, noId)).toBe(false);
    expect(needsIdNudge({ ...live, wants_18a: false }, noId)).toBe(false);
    expect(needsIdNudge({ ...live, wants_18a: null }, noId)).toBe(false);
    expect(needsIdNudge({ ...live, first_donation_id: null }, noId)).toBe(false);
  });
  it("not for a company or trust, not when an ID number is already there, not when the details were erased", () => {
    expect(needsIdNudge(live, { ...noId, donor_type: "company" })).toBe(false);
    expect(needsIdNudge(live, { ...noId, id_number_encrypted: "v1.x.y.z" })).toBe(false);
    expect(needsIdNudge(live, { ...noId, erased_at: "2026-11-01T00:00:00Z" })).toBe(false);
    expect(needsIdNudge(live, null)).toBe(false);
    expect(needsIdNudge(live, undefined)).toBe(false);
  });
  it("not for a monthly donation set up with \"Add my details after paying\": the s18A details form covers it, so one gift never shows two ID forms", () => {
    expect(needsIdNudge(live, { ...noId, tax_reference_encrypted: null, address_line1: null })).toBe(false);
    expect(needsIdNudge(live, { ...noId, tax_reference_encrypted: null })).toBe(false);
    expect(needsIdNudge(live, { ...noId, address_line1: null })).toBe(false);
  });
});

describe("the ID number typed", () => {
  it("accepts a valid SA ID number with spaces, and keeps only the digits", () => {
    expect(cleanSaIdNumber("8001 0150 09087")).toEqual({ ok: true, id: "8001015009087" });
  });
  it("refuses an empty, short, or wrong number in plain words, with no exclamation marks", () => {
    for (const bad of ["", "   ", "1234", "8001015009088", "ABC", 42, null, undefined]) {
      const r = cleanSaIdNumber(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).not.toMatch(/!/);
    }
  });
});

describe("which gifts get the ID number", () => {
  const scope = { recurringId: "r1", donorIds: new Set(["donor-a", "donor-b"]), taxYear: 2027, onIssuedReceipt: new Set(["g-issued"]) };
  const gift = (id: string, over: Partial<{ recurring_id: string | null; donor_id: string; status: string; tax_year: number | null }> = {}) => ({
    id, recurring_id: "r1", donor_id: "donor-a", status: "paid", tax_year: 2027, ...over,
  });
  it("this monthly donation's paid gifts of the current tax year, of the signed-in person, not on an issued receipt", () => {
    const gifts = [
      gift("g-ok"),
      gift("g-ok-b", { donor_id: "donor-b" }),
      gift("g-issued"),
      gift("g-other-monthly", { recurring_id: "r2" }),
      gift("g-once-off", { recurring_id: null }),
      gift("g-someone-else", { donor_id: "donor-z" }),
      gift("g-pending", { status: "pending" }),
      gift("g-refunded", { status: "refunded" }),
      gift("g-last-year", { tax_year: 2026 }),
      gift("g-no-year", { tax_year: null }),
    ];
    expect(giftsToUpdate(gifts, scope)).toEqual(["g-ok", "g-ok-b"]);
  });
  it("nothing to update is an empty list, not an error", () => {
    expect(giftsToUpdate([], scope)).toEqual([]);
  });
});

describe("wording", () => {
  it("is plain SA English: s18A receipt, no exclamation marks, no em dashes", () => {
    for (const t of [NUDGE_TEXT, SAVED_TEXT, CONFIRM_TEXT]) {
      expect(t).not.toMatch(/!/);
      expect(t).not.toMatch(/—/);
    }
    expect(NUDGE_TEXT).toContain("s18A receipt");
  });
});

describe("an ID number kept on the monthly donation (first gift already receipted)", () => {
  const rec = { id_number_carry_encrypted: "v1.id", id_number_carry_last4: "9087", receipt_identity_carry: "fp-id" };
  it("stops asking once it is kept", () => {
    expect(needsIdNudge({ ...live, id_number_carry_last4: "9087" }, noId)).toBe(false);
  });
  it("every new gift takes it when the copied details have none", () => {
    expect(withCarriedId({ ...noId, receipt_identity: "fp-tax" }, rec)).toMatchObject({ id_number_encrypted: "v1.id", id_number_last4: "9087", receipt_identity: "fp-id" });
  });
  it("never over an ID already there, an erased record or an organisation, and not without one kept", () => {
    expect(withCarriedId({ ...noId, id_number_encrypted: "v1.other" }, rec).id_number_encrypted).toBe("v1.other");
    expect(withCarriedId({ ...noId, erased_at: "2026-11-01" }, rec).id_number_encrypted).toBeNull();
    expect(withCarriedId({ ...noId, donor_type: "company" }, rec).id_number_encrypted).toBeNull();
    expect(withCarriedId(noId, { id_number_carry_encrypted: null }).id_number_encrypted).toBeNull();
    expect(withCarriedId(null, rec)).toBeNull();
  });
});
