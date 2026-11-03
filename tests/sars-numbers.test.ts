import { describe, expect, it } from "vitest";
import {
  dateOfBirthFromSaId,
  DONOR_TAX_REFERENCE_FIRST_DIGITS,
  ENTITY_TAX_REFERENCE_FIRST_DIGITS,
  isValidCompanyRegistration,
  isValidTaxReference,
  normaliseCompanyRegistration,
  passesModulus10,
  passesSaIdCheck,
} from "@/lib/sars-numbers";
import { isValidSaIdNumber } from "@/lib/sa-id";
import { centsToRandDecimal } from "@/lib/money";

/** A tax reference with the right check digit, from its first nine digits. */
function taxRef(first9: string): string {
  for (let d = 0; d <= 9; d++) if (passesModulus10(first9 + d)) return first9 + d;
  throw new Error("no check digit");
}

describe("Appendix I, Modulus 10 (BRS p.264)", () => {
  it("accepts SARS's own example, 0001339050", () => {
    expect(passesModulus10("0001339050")).toBe(true);
  });
  it("refuses the same number with any other check digit", () => {
    for (let d = 1; d <= 9; d++) expect(passesModulus10(`000133905${d}`)).toBe(false);
  });
  it("adds the digits of a doubled digit above 9 (9 x 2 = 18 counts as 9)", () => {
    // 9 in position 1: 18 -> 9. Total 9, so the check digit is 1.
    expect(passesModulus10("9000000001")).toBe(true);
    expect(passesModulus10("9000000008")).toBe(false); // what you'd get adding 18 as it is
  });
  it("needs exactly 10 digits", () => {
    expect(passesModulus10("000133905")).toBe(false);
    expect(passesModulus10("00013390500")).toBe(false);
    expect(passesModulus10("000133905a")).toBe(false);
    expect(passesModulus10("")).toBe(false);
  });
  it("checks the first digit SARS allows for each field", () => {
    const seven = taxRef("700000000");
    expect(isValidTaxReference(seven, ENTITY_TAX_REFERENCE_FIRST_DIGITS)).toBe(true); // fields 216, 312
    expect(isValidTaxReference(seven, DONOR_TAX_REFERENCE_FIRST_DIGITS)).toBe(false); // field 414 has no 7
    expect(isValidTaxReference(taxRef("400000000"), ENTITY_TAX_REFERENCE_FIRST_DIGITS)).toBe(false);
    expect(isValidTaxReference("0001339050", DONOR_TAX_REFERENCE_FIRST_DIGITS)).toBe(true);
  });
});

describe("Appendix J, SA ID number (BRS p.266)", () => {
  it("accepts SARS's worked example 800101 5009 087, with or without spaces", () => {
    expect(passesSaIdCheck("8001015009087")).toBe(true);
    expect(passesSaIdCheck("800101 5009 087")).toBe(true);
  });
  it("refuses any other control digit", () => {
    for (let d = 0; d <= 9; d++) if (d !== 7) expect(passesSaIdCheck(`800101500908${d}`)).toBe(false);
  });
  it("needs 13 digits", () => {
    expect(passesSaIdCheck("800101500908")).toBe(false);
    expect(passesSaIdCheck("80010150090877")).toBe(false);
  });
  it("agrees with the website's own ID check on every number that check accepts", () => {
    // sa-id.ts uses the Luhn formula from the right; Appendix J writes the same sum out from the left.
    // sa-id.ts is stricter (a real date, citizenship 0 or 1), so everything it accepts must pass Appendix J.
    let checked = 0;
    for (let n = 0; n < 4000; n++) {
      const first12 = `${String(50 + (n % 50)).padStart(2, "0")}${String(1 + (n % 12)).padStart(2, "0")}${String(1 + (n % 28)).padStart(2, "0")}${String(n).padStart(4, "0")}${n % 2}8`;
      for (let d = 0; d <= 9; d++) {
        const id = first12 + d;
        if (isValidSaIdNumber(id)) {
          expect(passesSaIdCheck(id)).toBe(true);
          checked++;
        } else if (passesSaIdCheck(id)) {
          throw new Error(`Appendix J accepts ${id} but sa-id.ts does not, with a real date and citizenship 0 or 1`);
        }
      }
    }
    expect(checked).toBe(4000);
  });
  it("reads the date of birth: 1900s when the year is after this year's two digits, else 2000s", () => {
    const today = new Date("2026-11-03T10:00:00Z");
    expect(dateOfBirthFromSaId("8001015009087", today)).toBe("1980-01-01");
    expect(dateOfBirthFromSaId("0502295009081", today)).toBe(null); // 29/02/2005 doesn't exist
    expect(dateOfBirthFromSaId("2603015009080", today)).toBe("2026-03-01");
    expect(dateOfBirthFromSaId("2703015009080", today)).toBe("1927-03-01");
    expect(dateOfBirthFromSaId("8013015009087", today)).toBe(null);
  });
});

describe("Appendix K, company registration number (BRS p.267)", () => {
  const today = new Date("2026-11-03T10:00:00Z");
  it("accepts CCYY/NNNNNN/NN with a listed suffix", () => {
    for (const s of ["06", "07", "08", "09", "10", "11", "20", "21", "22", "23", "24", "25", "26", "30", "31"]) {
      expect(isValidCompanyRegistration(`2015/123456/${s}`, today)).toBe(true);
    }
  });
  it("refuses a suffix not on SARS's list", () => {
    for (const s of ["00", "01", "05", "12", "19", "27", "29", "32", "99"]) expect(isValidCompanyRegistration(`2015/123456/${s}`, today)).toBe(false);
  });
  it("needs a year from 1800 up to and including this year", () => {
    expect(isValidCompanyRegistration("1800/000001/06", today)).toBe(true);
    expect(isValidCompanyRegistration("1799/000001/06", today)).toBe(false);
    expect(isValidCompanyRegistration("2026/000001/07", today)).toBe(true);
    expect(isValidCompanyRegistration("2027/000001/07", today)).toBe(false);
  });
  it("reads a number typed with spaces, dashes or no separators, and refuses other shapes", () => {
    expect(normaliseCompanyRegistration(" 2015 123456 07 ")).toBe("2015/123456/07");
    expect(normaliseCompanyRegistration("201512345607")).toBe("2015/123456/07");
    expect(normaliseCompanyRegistration("2015-123456-07")).toBe("2015/123456/07");
    expect(isValidCompanyRegistration("201512345607", today)).toBe(true);
    expect(isValidCompanyRegistration("2015/12345/07", today)).toBe(false);
    expect(isValidCompanyRegistration("IT1234/2015", today)).toBe(false);
    expect(isValidCompanyRegistration("", today)).toBe(false);
  });
});

describe("Rand value for SARS (field 510)", () => {
  it("has exactly two decimals, no thousands separator and no leading zeros", () => {
    expect(centsToRandDecimal(0)).toBe("0.00");
    expect(centsToRandDecimal(50)).toBe("0.50");
    expect(centsToRandDecimal(125_000)).toBe("1250.00");
    expect(centsToRandDecimal(3_457)).toBe("34.57");
    expect(centsToRandDecimal(100_000_000)).toBe("1000000.00");
    expect(centsToRandDecimal(99_999_999_999_999_999n)).toBe("999999999999999.99");
  });
  it("refuses a negative amount", () => {
    expect(() => centsToRandDecimal(-1)).toThrow();
  });
});
