import { describe, expect, it } from "vitest";
import { SALESFORCE_HEADER, salesforceRows, splitName } from "@/lib/charity/salesforce-export";
import type { DonorRow } from "@/lib/charity/dashboard-queries";

const donor = (o: Partial<DonorRow>): DonorRow => ({
  donor_id: "d1", donor_type: "individual", display_name: "Thandi Mokoena", email: "thandi@example.com", phone: "0821234567",
  donation_count: 3, total_cents: 150_000, first_paid_at: "2026-03-05T10:00:00+02:00", last_paid_at: "2026-09-12T10:00:00+02:00",
  wants_18a: true, is_anonymous: false, ...o,
} as DonorRow);

describe("Salesforce donor export", () => {
  it("uses Salesforce's own Contact field names", () => {
    expect(SALESFORCE_HEADER).toEqual(["First Name", "Last Name", "Email", "Phone", "Account Name", "Lead Source", "Description"]);
  });
  it("splits a person's name and summarises their giving", () => {
    const [row] = salesforceRows([donor({})]);
    expect(row.slice(0, 6)).toEqual(["Thandi", "Mokoena", "thandi@example.com", "082 123 4567", "", "Givezy"]);
    expect(row[6]).toBe("Givezy donor: 3 gifts, R1 500 in total, first gift 05/03/2026, last gift 12/09/2026");
  });
  it("always gives a last name, and puts an organisation's name in Account Name too", () => {
    expect(splitName("Madonna")).toEqual({ first: "", last: "Madonna" });
    expect(splitName("Anna Maria van der Merwe")).toEqual({ first: "Anna Maria van der", last: "Merwe" });
    const [row] = salesforceRows([donor({ donor_type: "company", display_name: "Acme Foods (Pty) Ltd" })]);
    expect(row.slice(0, 5)).toEqual(["", "Acme Foods (Pty) Ltd", "thandi@example.com", "082 123 4567", "Acme Foods (Pty) Ltd"]);
  });
  it("says 1 gift, not 1 gifts", () => {
    expect(salesforceRows([donor({ donation_count: 1, total_cents: 3000 })])[0][6]).toContain("1 gift, R30 in total");
  });
  it("leaves out donors who asked to be erased", () => {
    expect(salesforceRows([donor({ email: "erased-abc@erased.invalid" })])).toEqual([]);
  });
});
