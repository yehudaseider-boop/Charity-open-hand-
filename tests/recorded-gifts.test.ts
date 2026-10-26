/** Gifts a charity records itself: amounts and dates are never guessed, files are read safely, repeats are caught. */
import { describe, expect, it } from "vitest";
import { alreadyRecorded, cameInBy, checkFile, checkGift, dateReadsBothWays, erasedGiftKey, giftKey, mapHeadings, parseCsv, parseGiftAmount, parseGiftDate, taxYearOfGift } from "@/lib/charity/recorded-gifts";

const today = "2026-10-21";

describe("amounts", () => {
  it("reads every clear way of writing Rand, in cents", () => {
    expect(parseGiftAmount("1250")).toEqual({ cents: 125_000 });
    expect(parseGiftAmount("1 250")).toEqual({ cents: 125_000 });
    expect(parseGiftAmount("R1 250.50")).toEqual({ cents: 125_050 });
    expect(parseGiftAmount("1250,50")).toEqual({ cents: 125_050 });
    expect(parseGiftAmount("1,250.00")).toEqual({ cents: 125_000 });
    expect(parseGiftAmount("1.250,00")).toEqual({ cents: 125_000 });
    expect(parseGiftAmount("R 30")).toEqual({ cents: 3_000 });
    expect(parseGiftAmount("0.5")).toEqual({ cents: 50 });
  });
  it("refuses an amount that could be read two ways, and says how to write it", () => {
    for (const s of ["1,250", "1.250", "50,000", "1.250.000", "1,25.00", "12,34.50", "1.2.3,00", "1,250.5.0"]) expect(parseGiftAmount(s)).toEqual({ error: expect.stringMatching(/two ways.*1250/) });
  });
  it("refuses empty, zero, nonsense, three decimals and anything over R1 000 000", () => {
    expect(parseGiftAmount("")).toEqual({ error: "Amount missing" });
    expect(parseGiftAmount("0")).toEqual({ error: expect.stringMatching(/more than R0/) });
    expect(parseGiftAmount("-50")).toHaveProperty("error");
    expect(parseGiftAmount("abc")).toHaveProperty("error");
    expect(parseGiftAmount("12.345")).toHaveProperty("error");
    expect(parseGiftAmount("1000000.01")).toEqual({ error: expect.stringMatching(/Over R1 000 000/) });
  });
});

describe("dates", () => {
  it("reads dd/mm/yyyy and yyyy-mm-dd, never in the future", () => {
    expect(parseGiftDate("05/03/2026", today)).toEqual({ date: "2026-03-05" });
    expect(parseGiftDate("5/3/2026", today)).toEqual({ date: "2026-03-05" });
    expect(parseGiftDate("2026-03-05", today)).toEqual({ date: "2026-03-05" });
    expect(parseGiftDate("22/10/2026", today)).toEqual({ error: expect.stringMatching(/future/) });
    expect(parseGiftDate("31/02/2026", today)).toEqual({ error: expect.stringMatching(/real date/) });
    expect(parseGiftDate("March 5", today)).toHaveProperty("error");
    expect(parseGiftDate("", today)).toEqual({ error: "Date missing" });
  });
  it("knows when a date could also be month/day", () => {
    expect(dateReadsBothWays("05/03/2026")).toBe(true);
    expect(dateReadsBothWays("25/03/2026")).toBe(false);
    expect(dateReadsBothWays("03/03/2026")).toBe(false);
    expect(dateReadsBothWays("2026-03-05")).toBe(false);
  });
  it("puts a gift in the right SARS tax year (March starts a new one)", () => {
    expect(taxYearOfGift("2026-02-28")).toBe(2026);
    expect(taxYearOfGift("2026-03-01")).toBe(2027);
  });
});

describe("one gift", () => {
  const base = { date: "05/03/2026", amount: "500", method: "eft", first_name: "Sarah", last_name: "Levin", email: "Sarah@Example.co.za" };
  it("a gift without an s18A receipt needs only who, when and how much", () => {
    const r = checkGift(base, { today });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gift).toMatchObject({ date: "2026-03-05", amountCents: 50_000, method: "eft", email: "sarah@example.co.za", wants18a: false, idNumber: null });
  });
  it("an s18A gift needs what SARS needs: address, and an ID or tax number", () => {
    const r = checkGift({ ...base, wants_18a: "yes" }, { today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["address_line1", "city", "id_number", "postal_code"]);
    const ok = checkGift({ ...base, wants_18a: "Yes", tax_reference: "0123456789", address_line1: "5 Road", city: "Johannesburg", postal_code: "2192" }, { today });
    expect(ok.ok).toBe(true);
  });
  it("a company needs its name, and its registration number for a receipt", () => {
    const r = checkGift({ date: "05/03/2026", amount: "500", method: "eft", donor_type: "company", email: "a@b.co.za", wants_18a: "yes", address_line1: "1 Rd", city: "Jhb", postal_code: "2000" }, { today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["organisation_name", "registration_number"]);
  });
  it("refuses a bad email, a bad ID number, an unknown method or an unclear s18A answer", () => {
    const r = checkGift({ ...base, email: "not-an-email", id_number: "123", method: "bitcoin", wants_18a: "maybe" }, { today });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "id_number", "method", "wants_18a"]);
  });
  it("uses the file's method where a row has none, and plain words for it", () => {
    const r = checkGift({ ...base, method: "" }, { today, fallbackMethod: "cash" });
    expect(r.ok && r.gift.method).toBe("cash");
    expect(checkGift({ ...base, method: "Debit order" }, { today }).ok && checkGift({ ...base, method: "Debit order" }, { today })).toMatchObject({ gift: { method: "debit_order" } });
    expect(cameInBy("eft")).toBe("EFT (bank transfer) (recorded by you)");
    expect(cameInBy(null)).toBe("Givezy");
  });
  it("strips line breaks and direction characters from names (they print on receipts)", () => {
    const r = checkGift({ ...base, first_name: "Sa\nrah‮" }, { today });
    expect(r.ok && r.gift.firstName).toBe("Sa rah");
  });
});

describe("files", () => {
  it("reads quotes, doubled quotes, commas and line breaks inside quotes, and Excel's semicolons", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv('a;b\r\n1;"2\n3"\r\n')).toEqual([["a", "b"], ["1", "2\n3"]]);
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("matches headings written different ways, and lists the ones it doesn't know", () => {
    const m = mapHeadings(["Transaction Date", "Bedrag", "E-mail", "Surname", "Favourite colour"]);
    expect(m.columns).toMatchObject({ date: 0, amount: 1, email: 2, last_name: 3 });
    expect(m.unknown).toEqual(["Favourite colour"]);
    expect(m.missing).toEqual([]);
    expect(mapHeadings(["Name", "Amount"]).missing).toEqual(["date", "email"]);
  });
  it("checks every row, leaves out problems and repeats, and adds up only what will be recorded", () => {
    const text = [
      "Date,Amount,First name,Surname,Email,Reference",
      "05/03/2026,500,Sarah,Levin,sarah@x.co.za,A1",
      "06/03/2026,1250.50,David,Cohen,david@x.co.za,",
      "07/03/2026,1,250,Bad,Amount,bad@x.co.za,",
      "08/03/2026,200,Sarah,Levin,sarah@x.co.za,A1",
      "09/03/2026,300,Thandi,Mokoena,thandi@x.co.za,OLD",
    ].join("\n");
    const r = checkFile(text, { today, fallbackMethod: "eft", seen: new Set([giftKey({ reference: "OLD", email: "", amountCents: 0, date: "" })]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.good).toBe(2);
    expect(r.bad).toBe(3);
    expect(r.totalCents).toBe(50_000 + 125_050);
    expect(r.rows.map((x) => [x.line, x.check.ok, Boolean(x.duplicateOf)])).toEqual([[2, true, false], [3, true, false], [4, false, false], [5, true, true], [6, true, true]]);
  });
  it("holds back a gift that matches one whose donor was erased, unless it has a reference", () => {
    // The erased gift kept only its amount and date (no email, no name).
    const seen = new Set([erasedGiftKey({ amountCents: 50_000, date: "2026-03-05" })]);
    const text = [
      "Date,Amount,First name,Surname,Email,Reference",
      "05/03/2026,500,Sarah,Levin,sarah@x.co.za,",
      "05/03/2026,500,Sarah,Levin,sarah@x.co.za,BANK-77",
      "06/03/2026,500,Sarah,Levin,sarah@x.co.za,",
    ].join("\n");
    const r = checkFile(text, { today, fallbackMethod: "eft", seen });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => [x.line, Boolean(x.duplicateOf), Boolean(x.duplicateOfErased)])).toEqual([[2, true, true], [3, false, false], [4, false, false]]);
    expect(alreadyRecorded(seen, { reference: null, email: "x@y.co", amountCents: 50_000, date: "2026-03-05" })).toBe("erased");
    expect(alreadyRecorded(seen, { reference: "R1", email: "x@y.co", amountCents: 50_000, date: "2026-03-05" })).toBeNull();
  });
  it("refuses a file with no gifts, missing columns, too many rows or too many bytes, with what to do", () => {
    expect(checkFile("Date,Amount,Email\n", { today, fallbackMethod: "eft" })).toEqual({ ok: false, message: expect.stringMatching(/no gifts/) });
    expect(checkFile("Name,Amount\nA,1\n", { today, fallbackMethod: "eft" })).toEqual({ ok: false, message: expect.stringMatching(/Date, Email column/) });
    const many = ["Date,Amount,Email", ...Array.from({ length: 1001 }, () => "05/03/2026,1,a@b.co")].join("\n");
    expect(checkFile(many, { today, fallbackMethod: "eft" })).toEqual({ ok: false, message: expect.stringMatching(/at most 1000/) });
    expect(checkFile("x".repeat(1_000_001), { today, fallbackMethod: "eft" })).toEqual({ ok: false, message: expect.stringMatching(/over 1 MB/) });
  });
  it("warns when no date settles day/month, and not when one does", () => {
    const head = "Date,Amount,First name,Surname,Email\n";
    const r1 = checkFile(head + "05/03/2026,1,A,B,a@b.co\n04/02/2026,1,A,B,c@b.co\n", { today, fallbackMethod: "eft" });
    expect(r1.ok && r1.datesReadBothWays).toBe(true);
    const r2 = checkFile(head + "05/03/2026,1,A,B,a@b.co\n25/02/2026,1,A,B,c@b.co\n", { today, fallbackMethod: "eft" });
    expect(r2.ok && r2.datesReadBothWays).toBe(false);
  });
});
