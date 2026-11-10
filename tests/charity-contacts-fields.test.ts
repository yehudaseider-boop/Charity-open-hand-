/**
 * The donor import's optional phone number and postal address (CRM build plan step 8, 10/11/2026): missing,
 * malformed, very long and formula-like cells, the ways a spreadsheet mangles them, and the decision that an ID or
 * tax number column is never read or kept.
 */
import { describe, expect, it } from "vitest";
import { checkContact, checkContactFile, cleanContactPhone, contactAddress, mapContactHeadings, rowProblems, CONTACT_TEMPLATE_HEADINGS } from "@/lib/charity/contacts";
import { csvCell } from "@/lib/csv";

const messages = (text: string) => {
  const f = checkContactFile(text);
  if (!f.ok) throw new Error(f.message);
  return rowProblems(f.rows).map((p) => `${p.line}: ${p.messages.join(" | ")}`);
};

describe("phone number and address are optional", () => {
  it("a row with only a name, or only a name and email, imports with the rest empty", () => {
    const f = checkContactFile(`${CONTACT_TEMPLATE_HEADINGS.join(",")}\nSarah,Example,,,,,,,,,,\n,,Example Trust,trust@example.co.za,,,,,,,,\n`);
    expect(f.ok && f.good).toBe(2);
    expect(f.ok && f.withPhone).toBe(0);
    expect(f.ok && f.withAddress).toBe(0);
    if (!f.ok || !f.rows[0].check.ok) return;
    expect(f.rows[0].check.contact).toMatchObject({ phone: null, addressLine1: null, addressLine2: null, suburb: null, city: null, postalCode: null });
  });

  it("a file with no phone or address columns at all imports", () => {
    const f = checkContactFile("First name,Surname,Email\nSarah,Example,sarah@example.co.za\n");
    expect(f.ok && f.good).toBe(1);
  });

  it("counts how many rows carry a phone number and an address, and part of an address counts", () => {
    const f = checkContactFile("First name,Phone,City,Postal code\nAnna,082 123 4567,,\nBen,,Cape Town,\nCara,,,8001\nDan,,,\n");
    expect(f.ok && [f.good, f.withPhone, f.withAddress]).toEqual([4, 1, 2]);
  });

  it("reads the headings people use for a phone number and an address", () => {
    const { columns, unknown } = mapContactHeadings(["Name", "Cell number", "Postal address", "Suburb", "Town", "Post code", "Province"]);
    expect(columns).toMatchObject({ first_name: 0, phone: 1, address_line1: 2, suburb: 3, city: 4, postal_code: 5 });
    expect(unknown).toEqual(["Province"]);
    expect(checkContactFile("Name,Phone,Telephone\nAnna,0821234567,0111234567")).toMatchObject({ ok: false, message: expect.stringContaining('"Phone" and "Telephone"') });
  });
});

describe("phone numbers", () => {
  it("are kept the way the rest of the site keeps them, however they were spaced", () => {
    for (const typed of ["082 123 4567", "(082) 123-4567", "082.123.4567", " 0821234567 "]) expect(cleanContactPhone(typed)).toEqual({ phone: "0821234567" });
    for (const typed of ["+27 82 123 4567", "27821234567", "0027 82 123 4567", "+27(82)123-4567"]) expect(cleanContactPhone(typed)).toEqual({ phone: "+27821234567" });
    expect(cleanContactPhone("")).toEqual({ phone: null });
    expect(cleanContactPhone(undefined)).toEqual({ phone: null });
  });

  it('a cell a spreadsheet wrote as ="0821234567" is read as the number inside', () => {
    expect(cleanContactPhone('="0821234567"')).toEqual({ phone: "0821234567" });
    const f = checkContactFile('First name,Phone,Postal code\nAnna,"=""082 123 4567""","=""0157"""\n');
    expect(f.ok && f.rows[0].check.ok && f.rows[0].check.contact).toMatchObject({ phone: "0821234567", postalCode: "0157" });
  });

  it("a number whose 0 was dropped is pointed out, never guessed", () => {
    const r = cleanContactPhone("821234567");
    expect(r.phone).toBeNull();
    expect(r.problem).toBe('"821234567" is one digit short for a phone number. If a spreadsheet dropped the 0 at the front, type it as 0821234567 and set the column to Text');
  });

  it("anything else is refused in plain words, and a very long cell is not echoed back whole", () => {
    for (const typed of ["12345", "08212345678", "+44 20 7946 0958", "call the office", "8.21235E+08", "=0821234567", "=1+1", "@SUM(1)"]) {
      const r = cleanContactPhone(typed);
      expect(r.phone, typed).toBeNull();
      expect(r.problem, typed).toContain("isn't a phone number we can read");
    }
    const long = cleanContactPhone("9".repeat(5000));
    expect(long.problem!.length).toBeLessThan(140);
    expect(long.problem).toContain("…");
  });
});

describe("the postal address", () => {
  it("keeps each part as typed, tidied to one line, and writes it on one line for the list", () => {
    const r = checkContact({ first_name: "Anna", address_line1: " 5  Example Road\n", address_line2: "Unit 2", suburb: "Example Suburb", city: "Pretoria", postal_code: " 0157 " });
    expect(r.ok && r.contact).toMatchObject({ addressLine1: "5 Example Road", addressLine2: "Unit 2", suburb: "Example Suburb", city: "Pretoria", postalCode: "0157" });
    expect(contactAddress({ address_line1: "5 Example Road", address_line2: null, suburb: "Example Suburb", city: "Pretoria", postal_code: "0157" })).toBe("5 Example Road, Example Suburb, Pretoria, 0157");
    expect(contactAddress({})).toBe("");
  });

  it("a postal code that isn't 4 digits is refused, with the dropped 0 pointed out", () => {
    const short = checkContact({ first_name: "Anna", postal_code: "157" });
    expect(!short.ok && short.errors.postal_code).toBe('"157" isn\'t a postal code: they are 4 digits. If a spreadsheet dropped a 0 at the front, type it as 0157 and set the column to Text');
    for (const typed of ["21920", "2I92", "=2192", "two thousand"]) {
      const r = checkContact({ first_name: "Anna", postal_code: typed });
      expect(!r.ok && r.errors.postal_code, typed).toBe(`"${typed}" isn't a postal code: they are 4 digits`);
    }
    const long = checkContact({ first_name: "Anna", postal_code: "7".repeat(3000) });
    expect(!long.ok && long.errors.postal_code!.length).toBeLessThan(80);
  });

  it("an address line, suburb or city that is too long is refused, never cut", () => {
    const r = checkContact({ first_name: "Anna", address_line1: "a".repeat(201), address_line2: "b".repeat(201), suburb: "c".repeat(81), city: "d".repeat(81) });
    expect(!r.ok && r.errors).toEqual({
      address_line1: "Address is over 200 characters",
      address_line2: "Address line 2 is over 200 characters",
      suburb: "Suburb is over 80 characters",
      city: "City is over 80 characters",
    });
    const fits = checkContact({ first_name: "Anna", address_line1: "a".repeat(200), city: "d".repeat(80) });
    expect(fits.ok).toBe(true);
  });
});

describe("formula-like cells", () => {
  it("a name, address, email or tag that starts with = is refused, saying which and why", () => {
    const r = checkContact({ first_name: "=HYPERLINK(\"http://x.test\",\"Anna\")", last_name: " =cmd|' /C calc'!A0", address_line1: "=1+1", city: "=A1", email: "=1+1@x.co.za", tags: "Volunteer; =SUM(A1)" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.first_name).toBe('First name starts with "=", which a spreadsheet reads as a formula. Type it as plain text');
    expect(r.errors.last_name).toContain("Surname starts with");
    expect(r.errors.address_line1).toContain("Address starts with");
    expect(r.errors.city).toContain("City starts with");
    expect(r.errors.email).toContain("Email starts with");
    expect(r.errors.tags).toContain("A tag starts with");
    expect(Object.values(r.errors).join(" ")).not.toMatch(/!/);
  });

  it("a whole file: the row is listed, and nothing is imported", () => {
    const m = messages('First name,Surname,Phone,Address\nAnna,Example,0821234567,5 Example Road\n=A1,Example,=0821234567,"=""5 Example Road"""\n');
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/^3: /);
    expect(m[0]).toContain("First name starts with");
    expect(m[0]).toContain("isn't a phone number we can read");
    expect(m[0]).toContain("Address starts with");
  });

  it("text that starts with +, - or @ is kept as typed, and is made safe if it is ever written to a spreadsheet", () => {
    const r = checkContact({ first_name: "@anna", organisation_name: "+Plus Media", address_line1: "-", note: "- called on 05/05/2026\n=later" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contact).toMatchObject({ firstName: "@anna", organisationName: "+Plus Media", addressLine1: "-" });
    for (const v of [r.contact.firstName, r.contact.organisationName, r.contact.addressLine1, r.contact.note]) expect(csvCell(v)).toMatch(/^"?'/);
  });
});

describe("the same person twice, with the new columns", () => {
  it("is still caught by email, whatever the phone number or address says", () => {
    const m = messages("First name,Email,Phone,City\nAnna,anna@x.co.za,0821234567,Durban\nAnna,Anna@X.co.za,0831234567,Cape Town\n");
    expect(m).toEqual(["3: Same email as row 2. Keep one of them"]);
    const f = checkContactFile("First name,Email,Phone\nCara,cara@x.co.za,0821234567", { existingEmails: new Set(["cara@x.co.za"]) });
    expect(f.ok && rowProblems(f.rows)[0].messages[0]).toBe("cara@x.co.za is already on your list from an earlier import");
  });

  it("two people may share a phone number or an address (a household)", () => {
    const f = checkContactFile("First name,Email,Phone,Address\nAnna,anna@x.co.za,0821234567,5 Example Road\nBen,ben@x.co.za,0821234567,5 Example Road\n");
    expect(f.ok && [f.good, f.bad]).toEqual([2, 0]);
  });
});

describe("ID and tax numbers", () => {
  it("are never read into a contact: the column is named so the page can say it isn't kept", () => {
    const f = checkContactFile("First name,Surname,ID number,Tax  Number,Phone\nAnna,Example,8001015009087,0001339050,0821234567\n");
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.identityColumns).toEqual(["ID number", "Tax  Number"]);
    expect(f.unknownColumns).toEqual(["ID number", "Tax  Number"]);
    expect(f.good).toBe(1);
    expect(JSON.stringify(f.rows)).not.toMatch(/8001015009087|0001339050/);
    expect(JSON.stringify(f)).not.toMatch(/8001015009087|0001339050/);
  });

  it("a file without them says nothing about them", () => {
    const f = checkContactFile("First name,Phone\nAnna,0821234567\n");
    expect(f.ok && f.identityColumns).toEqual([]);
  });
});
