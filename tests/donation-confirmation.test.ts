import { describe, expect, it } from "vitest";
import { checkDonorDetails, checkoutSchema } from "@/lib/donations/validation";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { donationReference } from "@/lib/donations/reference";

describe("donation reference", () => {
  it("is short, upper case and stable", () => {
    expect(donationReference("3f9a2c71-0b1d-4e5f-9a8b-123456789abc")).toBe("NL-3F9A2C71");
  });
});

describe("confirmation email", () => {
  const base = { id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", charityName: "Meals Fund", amountCents: 18_000, totalCents: 18_000, paidAt: "2026-10-08T10:00:00Z", wants18a: false };

  it("shows the donation, reference and no contribution line when there is none", () => {
    const m = confirmationEmail({ ...base, contributionCents: 0 });
    expect(m.subject).toContain("NL-3F9A2C71");
    expect(m.text).toContain("Donation to Meals Fund: R180");
    expect(m.text).not.toContain("Contribution");
    expect(m.text).toContain("08/10/2026");
  });

  it("shows the contribution as its own line", () => {
    const m = confirmationEmail({ ...base, contributionCents: 2_500, totalCents: 20_500 });
    expect(m.text).toContain("Contribution to Givezy: R25");
    expect(m.text).toContain("Total paid: R205");
  });
});

describe("s18A details", () => {
  const person = (extra: Record<string, string>) =>
    checkoutSchema.parse({ donor_type: "individual", email: "a@b.co.za", first_name: "A", last_name: "B", giving_kind: "maaser", age_confirmed: "on", popia_consent: "on", wants_18a: "on", ...extra });

  const home = { address_line1: "12 Main Road", city: "Johannesburg", postal_code: "2195" };

  it("needs an ID number or a tax number, and the donor's address (SARS asks for it), but not a phone", () => {
    expect(checkDonorDetails(person({ ...home }), true)).toHaveProperty("id_number");
    expect(checkDonorDetails(person({ ...home, tax_reference: "0123456789" }), true)).toEqual({});
    expect(checkDonorDetails(person({ ...home, id_number: "8001015009087" }), true)).toEqual({});
    expect(Object.keys(checkDonorDetails(person({ id_number: "8001015009087" }), true)).sort()).toEqual(["address_line1", "city", "postal_code"]);
    expect(checkDonorDetails(person({ ...home, id_number: "8001015009087", postal_code: "21" }), true)).toEqual({ postal_code: "Postal codes are 4 digits" });
  });

  it("asks for no address when no s18A receipt is wanted", () => {
    const noReceipt = checkoutSchema.parse({ donor_type: "individual", email: "a@b.co.za", first_name: "A", last_name: "B", age_confirmed: "on", popia_consent: "on" });
    expect(checkDonorDetails(noReceipt, true)).toEqual({});
  });

  it("still checks the numbers that are given", () => {
    expect(checkDonorDetails(person({ id_number: "8001015009080" }), true)).toHaveProperty("id_number");
    expect(checkDonorDetails(person({ tax_reference: "123" }), true)).toHaveProperty("tax_reference");
  });
});

describe("donate form wording", () => {
  it("says plainly when a field is too long, instead of the library's own words", () => {
    const r = checkoutSchema.safeParse({ donor_type: "individual", email: "a@b.co", first_name: "x".repeat(81), postal_code: "21960" });
    expect(r.success).toBe(false);
    const byField = Object.fromEntries((r.success ? [] : r.error.issues).map((i) => [String(i.path[0]), i.message]));
    expect(byField.first_name).toBe("Please keep your first name to 80 characters or fewer");
    expect(byField.postal_code).toBe("Postal codes are 4 digits");
  });
});

import { vi } from "vitest";
vi.mock("server-only", () => ({}));
const { quoteDonation } = await import("@/lib/donations/checkout");

describe("the website's amount check", () => {
  it("refuses more than R1 000 000 in one go, as a typo guard", () => {
    expect(quoteDonation(100_000_000, 0).ok).toBe(true);
    const r = quoteDonation(100_000_001, 0);
    expect(r.ok === false && r.message).toMatch(/most you can give online in one go is R1 000 000/);
  });
});
