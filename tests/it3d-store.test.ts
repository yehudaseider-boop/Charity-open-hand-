/**
 * The pure pieces around the IT3(d) loader: the donor key for field 404, the donor taken from a receipt's gifts,
 * and the tax year and period a request may ask for. No database (the loader's queries are covered by hand).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => s.replace("enc:", "") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));
vi.mock("@/lib/mfa", () => ({ hasSecondStep: async () => false }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/charity/team", () => ({ memberRole: async () => null }));

import { donorKeyOf, receiptDonor, type Gift } from "@/lib/receipts/it3d-store";
import { readChoice } from "@/lib/receipts/it3d-request";

const details = (over: Partial<NonNullable<Gift["details"]>> = {}): NonNullable<Gift["details"]> => ({
  donor_type: "individual",
  first_name: "Thabo",
  last_name: "Mokoena",
  organisation_name: null,
  registration_number: null,
  phone: "0821112222",
  email: "thabo@example.co.za",
  id_number_encrypted: "enc:8001015009087",
  tax_reference_encrypted: null,
  address_line1: "12 Main Road",
  address_line2: null,
  suburb: "Parkhurst",
  city: "Johannesburg",
  postal_code: "2193",
  erased_at: null,
  ...over,
});
let n = 0;
const gift = (paid_at: string, over: Partial<NonNullable<Gift["details"]>> = {}): Gift => ({ id: `g${++n}`, status: "paid", paid_at, amount_cents: 1000, recorded_method: null, details: details(over) });
const open = (v: string | null) => (v ? v.replace("enc:", "") : null);

describe("donorKeyOf", () => {
  it("writes a donor identity fingerprint in hex, 40 characters, never the number itself", () => {
    const identity = Buffer.from("a".repeat(32), "utf8").toString("base64url");
    const key = donorKeyOf(identity, "donor-id");
    expect(key).toBe("61".repeat(20));
    expect(key).toMatch(/^[0-9a-f]{40}$/);
    expect(donorKeyOf(identity, "other")).toBe(key); // the same identity, the same key
  });
  it("falls back to the donor record's id when there is no fingerprint, or a short one", () => {
    expect(donorKeyOf(null, "donor-id")).toBe("donor-id");
    expect(donorKeyOf(Buffer.from("short").toString("base64url"), "donor-id")).toBe("donor-id");
  });
});

describe("receiptDonor", () => {
  it("takes name, address and the tax number from the newest gift, and the ID number every gift carries", () => {
    const d = receiptDonor([
      gift("2026-05-01T08:00:00Z", { last_name: "Old", address_line1: "1 Old Street", tax_reference_encrypted: "enc:0001339050" }),
      gift("2026-11-01T08:00:00Z", { last_name: "New", address_line1: "2 New Street", tax_reference_encrypted: null }),
    ], open);
    expect(d).toMatchObject({ lastName: "New", address: { line1: "2 New Street" }, taxReference: null, idNumber: "8001015009087", idNumbersDiffer: false, erased: false });
  });
  it("flags two different ID numbers on one receipt", () => {
    const d = receiptDonor([gift("2026-05-01T08:00:00Z"), gift("2026-06-01T08:00:00Z", { id_number_encrypted: "enc:8001015009095" })], open);
    expect(d.idNumbersDiffer).toBe(true);
    const same = receiptDonor([gift("2026-05-01T08:00:00Z"), gift("2026-06-01T08:00:00Z")], open);
    expect(same.idNumbersDiffer).toBe(false);
  });
  it("is erased when the newest gift's details are erased or missing", () => {
    expect(receiptDonor([gift("2026-05-01T08:00:00Z", { erased_at: "2026-09-01T00:00:00Z" })], open).erased).toBe(true);
    expect(receiptDonor([{ ...gift("2026-05-01T08:00:00Z"), details: null }], open).erased).toBe(true);
    expect(receiptDonor([], open)).toMatchObject({ erased: true, idNumber: null, idNumbersDiffer: false });
  });
});

describe("readChoice", () => {
  const now = new Date("2026-11-03T10:00:00Z"); // tax year 2027
  it("takes a tax year from 2022 to the current one, and one of the two periods", () => {
    expect(readChoice("2027", "full_year", now)).toEqual({ taxYear: 2027, period: "full_year" });
    expect(readChoice(2022, "first_half", now)).toEqual({ taxYear: 2022, period: "first_half" });
  });
  it("refuses a year before 2022, after this tax year, a non-integer, or an unknown period", () => {
    expect(readChoice("2021", "full_year", now)).toBe(null);
    expect(readChoice("2028", "full_year", now)).toBe(null);
    expect(readChoice("2027.5", "full_year", now)).toBe(null);
    expect(readChoice("abc", "full_year", now)).toBe(null);
    expect(readChoice(null, "full_year", now)).toBe(null);
    expect(readChoice("2027", "whole", now)).toBe(null);
    expect(readChoice("2027", undefined, now)).toBe(null);
  });
});
