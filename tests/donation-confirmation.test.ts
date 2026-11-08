import { describe, expect, it } from "vitest";
import { checkDonorDetails, checkoutSchema } from "@/lib/donations/validation";
import { confirmationEmail } from "@/lib/donations/confirmation-email";
import { donationReference } from "@/lib/donations/reference";

describe("donation reference", () => {
  it("is short, upper case and stable", () => {
    expect(donationReference("3f9a2c71-0b1d-4e5f-9a8b-123456789abc")).toBe("GZ-3F9A2C71");
  });
});

describe("confirmation email", () => {
  const base = { id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", charityName: "Meals Fund", amountCents: 18_000, totalCents: 18_000, paidAt: "2026-10-08T10:00:00Z", wants18a: false };

  it("shows the donation, reference and no contribution line when there is none", () => {
    const m = confirmationEmail({ ...base, contributionCents: 0 });
    expect(m.subject).toContain("GZ-3F9A2C71");
    expect(m.text).toContain("Donation to Meals Fund: R180");
    expect(m.text).not.toContain("Contribution");
    expect(m.text).toContain("08/10/2026");
  });

  it("shows the contribution as its own line", () => {
    const m = confirmationEmail({ ...base, contributionCents: 2_500, totalCents: 20_500 });
    expect(m.text).toContain("Contribution to Givezy: R25");
    expect(m.text).toContain("Total paid: R205");
  });

  it("with s18A details still to add, says how to add them and that the receipt waits for them (04/11/2026)", () => {
    const m = confirmationEmail({ ...base, contributionCents: 0, wants18a: true, s18aDetailsMissing: true, accountUrl: "https://givezy.test/account" });
    expect(m.text).toContain("add your SA ID number (or registration number) and address: sign in at https://givezy.test/account");
    expect(m.text).not.toContain("This donation will be on your annual s18A receipt");
    expect(confirmationEmail({ ...base, contributionCents: 0, wants18a: true }).text).toContain("This donation will be on your annual s18A receipt");
  });
});

describe("s18A details", () => {
  const person = (extra: Record<string, string>) =>
    checkoutSchema.parse({ donor_type: "individual", email: "a@b.co.za", first_name: "A", last_name: "B", giving_kind: "maaser", age_confirmed: "on", popia_consent: "on", wants_18a: "on", ...extra });

  const home = { address_line1: "12 Main Road", city: "Johannesburg", postal_code: "2195" };

  it("needs an SA ID number (an income tax number alone is not enough, decided 03/11/2026) and the donor's address, but not a phone", () => {
    expect(checkDonorDetails(person({ ...home }), true)).toHaveProperty("id_number");
    expect(checkDonorDetails(person({ ...home, tax_reference: "0001339050" }), true)).toEqual({ id_number: "Enter your SA ID number. SARS needs it for an s18A receipt" });
    expect(checkDonorDetails(person({ ...home, id_number: "8001015009087", tax_reference: "0001339050" }), true)).toEqual({});
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

  it("checks an income tax number with SARS's Modulus 10 when one is given", () => {
    const ok = { ...home, id_number: "8001015009087" };
    expect(checkDonorDetails(person({ ...ok, tax_reference: "0001339051" }), true)).toEqual({ tax_reference: "That income tax number doesn't look right. Check the 10 digits, or leave it empty" });
    expect(checkDonorDetails(person({ ...ok, tax_reference: "000 133 9050" }), true)).toEqual({});
  });

  it("asks a company for its CIPC number and a trust for any registration number", () => {
    const org = (type: "company" | "trust", reg?: string) =>
      checkoutSchema.parse({ donor_type: type, email: "a@b.co.za", organisation_name: "Acme", contact_person: "A B", age_confirmed: "on", popia_consent: "on", wants_18a: "on", ...home, ...(reg ? { registration_number: reg } : {}) });
    expect(checkDonorDetails(org("company"), true)).toEqual({ registration_number: "Needed for an s18A receipt" });
    expect(checkDonorDetails(org("company", "12345"), true)).toEqual({ registration_number: "Use the company's CIPC number, for example 2015/123456/07" });
    expect(checkDonorDetails(org("company", "2015/123456/07"), true)).toEqual({});
    expect(checkDonorDetails(org("trust"), true)).toEqual({ registration_number: "Needed for an s18A receipt" });
    expect(checkDonorDetails(org("trust", "IT1234/2015"), true)).toEqual({});
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
