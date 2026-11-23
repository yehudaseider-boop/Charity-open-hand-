/**
 * The s18A details a donor types are checked against what SARS's IT3(d) file can hold (tester, 23/11/2026): at
 * checkout on the website and in the app, and on the "add my s18A details" form, with the IT3(d) builder's own
 * character rule. Only with an s18A receipt: names typed for a gift without one stay as they are. Also the ID number's
 * plain-words problems and the shared address messages.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADDRESS_MESSAGES, postalCodeProblem, SARS_LIMITS, sarsAddressProblems, sarsFileBadCharacter, sarsTextProblem, trustNumberProblem } from "@/lib/donations/s18a-rules";
import { checkDonorDetails, checkoutSchema, registrationNumberProblem } from "@/lib/donations/validation";
import { checkS18aCompletion } from "@/lib/donations/s18a-details";
import { cleanSaIdNumber } from "@/lib/donations/monthly-id-nudge";
import { SA_ID_EMPTY, saIdProblem } from "@/lib/sa-id";

const parse = (raw: Record<string, string | undefined>) => checkoutSchema.parse(raw);
const agreed = { donor_type: "individual", email: "a@example.com", first_name: "Dana", last_name: "Dube", age_confirmed: "on", popia_consent: "on" } as const;
const now = { ...agreed, wants_18a: "on", s18a_when: "now", id_number: "8001015009087", address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001" } as const;

describe("what SARS's receipt file can hold", () => {
  it("is the IT3(d) builder's own rule", () => {
    expect(readFileSync("src/lib/receipts/it3d.ts", "utf8")).toContain("const badCharacter = sarsFileBadCharacter;");
    expect(sarsFileBadCharacter("Nguyễn")).toBe("ễ");
    expect(sarsFileBadCharacter("Zoë Müller-Núñez O'Brien")).toBeNull();
    expect(sarsFileBadCharacter("a\tb")).toBe("\t");
  });

  it("says what to do, naming the character", () => {
    expect(sarsTextProblem("Nguyễn", "name")).toBe(`SARS's receipt file can't hold "ễ". Please type it as it appears on your ID document, without that letter's accent.`);
    expect(sarsTextProblem("Ştefan Holdings", "organisation")).toBe(`SARS's receipt file can't hold "Ş". Please type it as it is registered, without that letter's accent.`);
    expect(sarsTextProblem("Đường 5", "address")).toBe(`SARS's receipt file can't hold "Đ". Please type it in Latin letters.`);
    expect(sarsTextProblem("王", "name")).toBe(`SARS's receipt file can't hold "王". Please type it in Latin letters as it appears on your ID document.`);
    expect(sarsTextProblem("Dana 😀", "name")).toBe(`SARS's receipt file can't hold "😀". Please leave it out.`);
    expect(sarsTextProblem("12 | Main", "address")).toBe(`SARS's receipt file can't hold "|". Please use another character.`);
    // An "é" typed as e plus an accent is kept as the one letter, which the file holds.
    expect(sarsTextProblem("René", "name")).toBeNull();
    for (const m of [sarsTextProblem("Nguyễn", "name"), sarsTextProblem("😀", "address")]) expect(m).not.toMatch(/!|—/);
  });

  it("checks lengths, a trust number and the postal code", () => {
    expect(sarsAddressProblems({ address_line1: "a".repeat(SARS_LIMITS.addressLine) })).toEqual({});
    expect(sarsAddressProblems({ address_line1: "a".repeat(101), suburb: "Đa Kao" })).toEqual({
      address_line1: "SARS's receipt file holds at most 100 characters for the street address. Please shorten it (it has 101).",
      suburb: `SARS's receipt file can't hold "Đ". Please type it in Latin letters.`,
    });
    expect(trustNumberProblem("IT123456/2015")).toBeNull();
    expect(trustNumberProblem("IT123456789012345678901234/2015")).toMatch(/at most 30 characters for SARS \(this one has 31\)/);
    expect(postalCodeProblem("")).toBe(ADDRESS_MESSAGES.postalEmpty);
    expect(postalCodeProblem("20")).toBe(ADDRESS_MESSAGES.postalNotFourDigits);
    expect(postalCodeProblem(" 2001 ")).toBeNull();
  });
});

describe("checkout (website, and the app through the same server check)", () => {
  it("with an s18A receipt: names, address and registration details SARS's file can't hold are refused before paying", () => {
    expect(checkDonorDetails(parse(now), true)).toEqual({});
    const e = checkDonorDetails(parse({ ...now, last_name: "Nguyễn", address_line1: "x".repeat(150), suburb: "Đa Kao" }), true);
    expect(e.last_name).toMatch(/can't hold "ễ"/);
    expect(e.address_line1).toMatch(/at most 100 characters/);
    expect(e.suburb).toMatch(/can't hold "Đ"/);
    // "Add my details after paying": the name still goes on the receipt, so it is still checked.
    expect(checkDonorDetails(parse({ ...agreed, last_name: "Nguyễn", wants_18a: "on", s18a_when: "later" }), true)).toHaveProperty("last_name");
  });

  it("without an s18A receipt (or at a charity that can't issue one), names stay as typed", () => {
    expect(checkDonorDetails(parse({ ...agreed, last_name: "Nguyễn" }), true)).toEqual({});
    expect(checkDonorDetails(parse({ ...now, last_name: "Nguyễn" }), false)).toEqual({});
  });

  it("a company's or trust's name at most 120 characters, and a trust number at most 30", () => {
    const org = { ...agreed, first_name: undefined, last_name: undefined, contact_person: "Dana", address_line1: "1 Rd", city: "Jhb", postal_code: "2001", wants_18a: "on", s18a_when: "now" };
    const trust = { ...org, donor_type: "trust", organisation_name: "Dube Family Trust", registration_number: "IT1234/2015" };
    expect(checkDonorDetails(parse(trust), true)).toEqual({});
    expect(checkDonorDetails(parse({ ...trust, organisation_name: "T".repeat(121) }), true).organisation_name).toMatch(/at most 120 characters for the registered name/);
    expect(checkDonorDetails(parse({ ...trust, registration_number: "IT123456789012345678901234/2015" }), true).registration_number).toMatch(/at most 30 characters/);
    // A long registered name is fine without an s18A receipt.
    expect(checkDonorDetails(parse({ ...trust, organisation_name: "T".repeat(121), wants_18a: undefined }), true)).toEqual({});
  });

  it("checks a registration number again for the type now chosen", () => {
    const s18a = { want18a: true, detailsNow: true };
    expect(registrationNumberProblem("company", "IT1234/2015", s18a)).toMatch(/CIPC number/);
    expect(registrationNumberProblem("trust", "IT1234/2015", s18a)).toBeNull();
    expect(registrationNumberProblem("trust", "", s18a)).toBe("Needed for an s18A receipt");
    expect(registrationNumberProblem("individual", "x", s18a)).toBeNull();
  });
});

describe("the add-my-s18A-details form", () => {
  const address = { address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001" };
  it("refuses an address SARS's file can't hold, and a trust number over 30 characters", () => {
    const r = checkS18aCompletion({ id_number: "8001015009087", ...address, address_line1: "y".repeat(120), city: "Hà Nội" }, "individual");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.address_line1).toMatch(/at most 100 characters/);
      expect(r.fieldErrors.city).toMatch(/can't hold "ộ"/);
    }
    const t = checkS18aCompletion({ registration_number: "IT123456789012345678901234/2015", ...address }, "trust");
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.fieldErrors.registration_number).toMatch(/at most 30 characters/);
  });
});

describe("the SA ID number, in plain words (the same on the website and in the app)", () => {
  it("says what is wrong", () => {
    expect(saIdProblem("8001015009087")).toBeNull();
    expect(saIdProblem("8001 0150 09087")).toBeNull();
    expect(saIdProblem("")).toBe(SA_ID_EMPTY);
    expect(saIdProblem("80010150090A7")).toBe("An SA ID number has digits only. Check for a letter or another character");
    expect(saIdProblem("800101500908")).toBe("An SA ID number has 13 digits. This one has 12");
    expect(saIdProblem("8013015009087")).toMatch(/aren't a real date/);
    expect(saIdProblem("8002305009087")).toMatch(/aren't a real date/); // 30 February
    expect(saIdProblem("8001015009287")).toMatch(/11th digit is 0 or 1/);
    expect(saIdProblem("8001015009086")).toBe("The last digit doesn't match: check for a typo");
  });

  it("checkout and the add-my-details form use the same words", () => {
    expect(checkDonorDetails(parse({ ...now, id_number: "8001015009086" }), true).id_number).toBe("The last digit doesn't match: check for a typo");
    expect(cleanSaIdNumber("8001015009086")).toEqual({ ok: false, message: "The last digit doesn't match: check for a typo" });
    expect(checkDonorDetails(parse({ ...now, id_number: undefined }), true).id_number).toBe(SA_ID_EMPTY);
  });

  it("the app's give screen uses the shared rules and messages", () => {
    const app = readFileSync("apps/mobile/src/app/give/[slug].tsx", "utf8");
    for (const used of ["saIdProblem(", "postalCodeProblem(", "sarsAddressProblems(", "sarsTextProblem(", "ADDRESS_MESSAGES.streetEmpty"]) expect(app).toContain(used);
    expect(app).not.toContain("That doesn't look like a valid SA ID number");
    expect(app).toContain('label="Suburb (optional)"');
  });
});
