import { describe, expect, it } from "vitest";
import { numberInWords, randInWords } from "@/lib/receipts/words";
import { buildReceiptHtml } from "@/lib/receipts/html";
import { donationNature } from "@/lib/receipts/details";

describe("amount in words on the s18A receipt", () => {
  it("writes whole rand, cents and both", () => {
    expect(randInWords(530_000)).toBe("Five thousand three hundred rand");
    expect(randInWords(3_457)).toBe("Thirty-four rand and fifty-seven cents");
    expect(randInWords(3_000)).toBe("Thirty rand");
    expect(randInWords(1)).toBe("One cent");
    expect(randInWords(100)).toBe("One rand");
    expect(randInWords(0)).toBe("Zero rand");
  });

  it("puts 'and' where South Africans say it", () => {
    expect(numberInWords(1005n)).toBe("one thousand and five");
    expect(numberInWords(125_000n)).toBe("one hundred and twenty-five thousand");
    expect(numberInWords(1_000_000n)).toBe("one million");
    expect(randInWords(100_000_000)).toBe("One million rand");
  });

  it("refuses a negative amount", () => {
    expect(() => randInWords(-1)).toThrow();
  });
});

describe("nature of donation", () => {
  it("says how the money came in", () => {
    expect(donationNature(null)).toBe("Card (online)");
    expect(donationNature("cash")).toBe("Cash");
    expect(donationNature("eft")).toBe("EFT (bank transfer)");
    expect(donationNature("constructor")).toBe("Other");
  });
});

describe("receipt layout", () => {
  const details = {
    charity: { legal_name_en: "Meals Fund NPC", legal_name_he: null, npo_number: "123-456 NPO", pbo_number: "930012345", s18a_reference: "18A/1", address: ["1 Test Road", "Johannesburg"] },
    donor: { donor_type: "individual" as const, name: "Sarah Dube", registration_number: null, id_number_last4: "9085", tax_reference_last4: null, address: ["5 Test Road"] },
    donations: [{ date: "15/09/2026", amount_cents: 18_000 }],
    tax_year: 2027,
    period: "01/03/2026 to 28/02/2027",
    wording: { title: "Section 18A receipt", statement: "Statement." },
    issued_on: "02/03/2027",
  };

  it("has the certificate and the donation summary, and still reads a receipt issued before references and natures", () => {
    const html = buildReceiptHtml({ details, reference: "MF-2027-0001", platformName: "Givezy" });
    expect(html).toContain("Donation summary");
    expect(html).toContain("One hundred and eighty rand");
    expect(html).toContain("Date of donation");
    expect(html).toContain("•••• 9085");
    expect(html).not.toContain("undefined");
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/—|!/);
  });
});
