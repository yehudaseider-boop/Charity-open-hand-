import { describe, expect, it } from "vitest";
import type { ReceiptDetails } from "@/lib/receipts/details";
import { gaps, yearList } from "@/lib/receipts/year-list";

const details = (donor: Partial<ReceiptDetails["donor"]>, gifts = 2): ReceiptDetails => ({
  charity: { legal_name_en: "Meals NPC", legal_name_he: null, npo_number: null, pbo_number: "930000000", s18a_reference: "S1", address: ["1 Main Rd", "Northcliff"] },
  donor: { donor_type: "individual", name: "Dana Levi", registration_number: null, id_number_last4: "9087", tax_reference_last4: null, address: ["12 Main Road", "Linden", "2195"], ...donor },
  donations: Array.from({ length: gifts }, () => ({ date: "2026-05-01", amount_cents: 10_000 })),
  tax_year: 2027,
  period: "",
  wording: { title: "", statement: "" },
  issued_on: "2027-03-05",
});
const receipt = (ref: string, cents: number, d: ReceiptDetails) => ({ reference: ref, issued_at: "2027-03-05T08:00:00Z", amount_cents: cents, details: d });

describe("the yearly receipt list (draft for SARS)", () => {
  it("flags what SARS will want that is missing", () => {
    expect(gaps(details({}))).toEqual([]);
    expect(gaps(details({ id_number_last4: null }))).toEqual(["no ID or income tax number"]);
    expect(gaps(details({ id_number_last4: null, tax_reference_last4: "1234" }))).toEqual([]);
    expect(gaps(details({ donor_type: "company", name: "Acme", id_number_last4: null, registration_number: "2020/123456/07" }))).toEqual([]);
    expect(gaps(details({ donor_type: "trust", name: "", id_number_last4: null, address: [] }))).toEqual(["no donor name", "no donor address", "no registration or income tax number"]);
  });
  it("Givezy's version shows the last 4 digits; the charity's only whether one is on file", () => {
    const rs = [receipt("GZ-2", 125_050, details({ id_number_last4: null })), receipt("GZ-1", 50_000, details({}))];
    const g = yearList(rs, "givezy");
    expect(g.header).toContain("ID number (last 4)");
    expect(g.rows[0].slice(0, 7)).toEqual(["GZ-1", "05/03/2027", "2026/27", "Dana Levi", "individual", "9087", ""]);
    const c = yearList(rs, "charity");
    expect(c.header).not.toContain("ID number (last 4)");
    expect(JSON.stringify(c.rows)).not.toContain("9087");
    expect(c.rows[0][5]).toBe("Yes");
    expect(c.rows[1][5]).toBe("No");
  });
  it("totals in whole cents, with a total row, and counts what needs attention", () => {
    const l = yearList([receipt("GZ-1", 125_050, details({})), receipt("GZ-2", 30, details({ address: [] }))], "charity");
    expect(l.totalCents).toBe(125_080);
    expect(l.count).toBe(2);
    expect(l.needAttention).toBe(1);
    expect(l.rows.at(-1)![0]).toBe("Total");
    expect(l.rows.at(-1)![l.amountColumns[0]]).toBe("1250.80");
    expect(l.rows[1].at(-1)).toBe("no donor address");
  });
  it("nothing issued, nothing listed (no lonely total row)", () => {
    expect(yearList([], "givezy").rows).toEqual([]);
  });
});
