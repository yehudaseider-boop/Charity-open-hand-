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
    expect(m.text).toContain("Donation to Meals Fund: R180.00");
    expect(m.text).not.toContain("Contribution");
    expect(m.text).toContain("08/10/2026");
  });

  it("shows the contribution as its own line", () => {
    const m = confirmationEmail({ ...base, contributionCents: 2_500, totalCents: 20_500 });
    expect(m.text).toContain("Contribution to NEDIV lev: R25.00");
    expect(m.text).toContain("Total paid: R205.00");
  });
});

describe("s18A details", () => {
  const person = (extra: Record<string, string>) =>
    checkoutSchema.parse({ donor_type: "individual", email: "a@b.co.za", first_name: "A", last_name: "B", giving_kind: "maaser", age_confirmed: "on", popia_consent: "on", wants_18a: "on", ...extra });

  it("needs an ID number or a tax number, but not an address or phone", () => {
    expect(checkDonorDetails(person({}), true)).toHaveProperty("id_number");
    expect(checkDonorDetails(person({ tax_reference: "0123456789" }), true)).toEqual({});
    expect(checkDonorDetails(person({ id_number: "8001015009087" }), true)).toEqual({});
  });

  it("still checks the numbers that are given", () => {
    expect(checkDonorDetails(person({ id_number: "8001015009080" }), true)).toHaveProperty("id_number");
    expect(checkDonorDetails(person({ tax_reference: "123" }), true)).toHaveProperty("tax_reference");
  });
});
