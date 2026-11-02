/** Importing a charity's own donor list (CSV): every row checked, problems in plain words, all or nothing. */
import { describe, expect, it } from "vitest";
import { checkContact, checkContactFile, contactName, mapContactHeadings, rowProblems, splitTags, CONTACT_TEMPLATE_HEADINGS, MAX_IMPORT_ROWS } from "@/lib/charity/contacts";

const head = CONTACT_TEMPLATE_HEADINGS.join(",");
const good = 'Sarah,Example,,Sarah@Example.co.za,082 123 4567,5 Example Road,,Example Suburb,Johannesburg,2192,Met at the open day,"Volunteer; newsletter"';

describe("one row", () => {
  it("keeps what was typed, tidied: lower-case email, phone without spaces, tags split", () => {
    const r = checkContact({ first_name: " Sarah ", last_name: "Example", email: "Sarah@Example.co.za", phone: "082 123 4567", tags: "Volunteer; volunteer | Newsletter" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.contact).toMatchObject({ firstName: "Sarah", lastName: "Example", email: "sarah@example.co.za", phone: "0821234567", tags: ["Volunteer", "Newsletter"] });
    expect(contactName(r.contact)).toBe("Sarah Example");
  });

  it("an organisation alone is a name", () => {
    const r = checkContact({ organisation_name: "Example Trust" });
    expect(r.ok && contactName(r.contact)).toBe("Example Trust");
  });

  it("says what is wrong in plain words, never guesses or cuts", () => {
    const r = checkContact({ email: "not-an-email", phone: "12345", postal_code: "219", note: "x".repeat(2001), tags: "y".repeat(41), first_name: "z".repeat(81) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.email).toContain("isn't an email address");
    expect(r.errors.phone).toContain("082 123 4567");
    expect(r.errors.postal_code).toContain("4 digits");
    expect(r.errors.note).toBe("The note is over 2 000 characters");
    expect(r.errors.tags).toContain("over 40 characters");
    expect(r.errors.first_name).toBe("First name is over 80 characters");
    expect(Object.values(r.errors).join(" ")).not.toMatch(/!/);
  });

  it("needs a name", () => {
    const r = checkContact({ email: "a@b.co.za" });
    expect(!r.ok && r.errors.first_name).toMatch(/^Name missing/);
    const blank = checkContact({ first_name: "  ", last_name: "‎" });
    expect(blank.ok).toBe(false);
  });

  it("at most 10 tags", () => {
    const r = checkContact({ first_name: "A", tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(";") });
    expect(!r.ok && r.errors.tags).toContain("at most 10");
    expect(splitTags("")).toEqual([]);
  });
});

describe("a whole file", () => {
  it("reads the template, with semicolons too", () => {
    const f = checkContactFile(`${head}\n${good}\n`);
    expect(f.ok && f.good).toBe(1);
    expect(f.ok && f.tagNames).toEqual(["Volunteer", "newsletter"]);
    const semi = checkContactFile("First name;Surname;Email\nSarah;Example;s@x.co.za\n");
    expect(semi.ok && semi.good).toBe(1);
  });

  it("refuses an empty file, one too big or too long, and one without a name column", () => {
    expect(checkContactFile("")).toMatchObject({ ok: false, message: expect.stringContaining("no donors") });
    expect(checkContactFile("x".repeat(1_000_001))).toMatchObject({ ok: false, message: expect.stringContaining("over 1 MB") });
    const many = `First name\n${Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i}`).join("\n")}`;
    expect(checkContactFile(many)).toMatchObject({ ok: false, message: expect.stringContaining(`at most ${MAX_IMPORT_ROWS}`) });
    expect(checkContactFile("Email,Phone\na@b.co.za,0821234567")).toMatchObject({ ok: false, message: expect.stringContaining("First name, Surname or Organisation") });
  });

  it("refuses two columns that mean the same thing, rather than pick one", () => {
    expect(mapContactHeadings(["Email", "E-mail", "Name"]).twice).toEqual([["Email", "E-mail"]]);
    const f = checkContactFile("First name,Email,E-mail\nSarah,a@b.co.za,c@d.co.za");
    expect(f).toMatchObject({ ok: false, message: expect.stringContaining('"Email" and "E-mail"') });
  });

  it("lists problems per row, the same email twice, and someone already imported", () => {
    const f = checkContactFile("First name,Email,Phone\nAnna,anna@x.co.za,\nBen,ANNA@x.co.za,\nCara,cara@x.co.za,999\nDan,dan@x.co.za,,extra,cells", { existingEmails: new Set(["cara@x.co.za"]) });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.good).toBe(1);
    expect(f.bad).toBe(3);
    const p = rowProblems(f.rows);
    expect(p.map((x) => x.line)).toEqual([3, 4, 5]);
    expect(p[0].messages).toEqual(["Same email as row 2. Keep one of them"]);
    expect(p[1].messages.join(" ")).toContain("isn't a phone number");
    expect(p[2].messages.join(" ")).toContain("more values than there are headings");
  });

  it("an earlier import's email is caught", () => {
    const f = checkContactFile("First name,Email\nCara,Cara@x.co.za", { existingEmails: new Set(["cara@x.co.za"]) });
    expect(f.ok && rowProblems(f.rows)[0].messages[0]).toContain("already on your list");
  });

  it("notices a gift file and lists columns it didn't use", () => {
    const f = checkContactFile("Date,Amount,First name,Favourite colour\n05/03/2026,1250,Sarah,blue");
    expect(f.ok && f.looksLikeGifts).toBe(true);
    expect(f.ok && f.unknownColumns).toEqual(["Date", "Amount", "Favourite colour"]);
  });

  it("very long names and right-to-left names are kept as typed", () => {
    const f = checkContactFile(`First name,Surname\n${"ش".repeat(80)},${"Long".repeat(20)}`);
    expect(f.ok && f.good).toBe(1);
  });
});
