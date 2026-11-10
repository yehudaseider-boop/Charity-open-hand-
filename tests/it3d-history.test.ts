/**
 * A charity's IT3(d) history (CRM build plan step 15): what is written for each download is counts and a total
 * only, and the owner's "Uploaded to SARS on" mark is a real day with a short plain reference.
 */
import { describe, expect, it } from "vitest";
import { ERASED_LEFT_OUT, type It3dResult } from "@/lib/receipts/it3d";
import { checkUploadMark, it3dHistoryEntry, MAX_UPLOAD_REFERENCE } from "@/lib/receipts/it3d-history";

const SOURCE = "S".repeat(144);
/** A built result as the routes hold it: full of things that must never reach the history. */
const result = {
  lines: [`H|GH|${SOURCE}|Givezy`, "B|DE|Sarah|Example|8001015009087|0001339050|5 Example Road", "T|3|1250.00"],
  fileName: "I3D_1_9000000007_0f9a2c71-0b1d-4e5f-9a8b-123456789abc_20270301T101500.psv",
  problems: [
    { severity: "warning", message: ERASED_LEFT_OUT, fix: null, receiptNumber: "NMF-2027-0003", donorName: "Erased Person", idLast4: "9087" },
    { severity: "warning", message: ERASED_LEFT_OUT, fix: null, receiptNumber: "NMF-2027-0004", donorName: "Another Person", idLast4: null },
    { severity: "blocking", message: "The ID number doesn't pass SARS's check.", fix: null, receiptNumber: "NMF-2027-0001", donorName: "Sarah Example", idLast4: "5009" },
  ],
  totals: { receipts: 12, donors: 10, donations: 14, totalCents: 1_250_050 },
  nil: false,
  fileReady: false,
  sheet: { entity: [["Income tax reference number", "9000000007"]], header: [], rows: [["Sarah", "Example", "8001015009087"]], amountColumn: 2 },
} as unknown as It3dResult;

describe("what the history keeps for one download", () => {
  it("is the charity, period, kind, who, and the counts and total, and nothing else", () => {
    const entry = it3dHistoryEntry({ charityId: "c1", userId: "u1", taxYear: 2027, period: "full_year", kind: "file", testData: true, result });
    expect(entry).toEqual({
      charity_id: "c1", tax_year: 2027, period: "full_year", kind: "file", test_data: true,
      receipts: 12, donors: 10, donations: 14, total_cents: 1_250_050, receipts_left_out: 2, created_by: "u1",
    });
    const text = JSON.stringify(entry);
    for (const secret of ["Sarah", "Example", "Erased", "8001015009087", "0001339050", "9087", "5009", "9000000007", SOURCE, "NMF-2027", ".psv", "Example Road"]) expect(text).not.toContain(secret);
  });

  it("a capture sheet is never a test file, and the total stays whole cents", () => {
    const entry = it3dHistoryEntry({ charityId: "c1", userId: "u1", taxYear: 2027, period: "first_half", kind: "sheet", testData: true, result: { totals: { receipts: 0, donors: 0, donations: 0, totalCents: 0 }, problems: [] } });
    expect(entry).toMatchObject({ kind: "sheet", test_data: false, receipts: 0, total_cents: 0, receipts_left_out: 0 });
    expect(Number.isInteger(it3dHistoryEntry({ charityId: "c1", userId: "u1", taxYear: 2027, period: "full_year", kind: "file", result }).total_cents)).toBe(true);
  });
});

describe("the owner's own \"Uploaded to SARS on\" mark", () => {
  // Downloaded on 10/11/2026 at 23:30 in Johannesburg (21:30 UTC); "now" is 12/11/2026 at 09:00.
  const producedAt = "2026-11-10T21:30:00Z";
  const now = new Date("2026-11-12T07:00:00Z");
  const check = (uploadedOn: unknown, reference: unknown = "") => checkUploadMark({ uploadedOn, reference, producedAt, now });

  it("takes a date typed the South African way, and an empty reference", () => {
    expect(check("11/11/2026")).toEqual({ ok: true, uploadedOn: "2026-11-11", reference: null });
    expect(check("10/11/2026")).toMatchObject({ ok: true, uploadedOn: "2026-11-10" });
    expect(check("12112026", "  eFiling   ref\t12345 ")).toEqual({ ok: true, uploadedOn: "2026-11-12", reference: "eFiling ref 12345" });
  });

  it("refuses a missing, unreadable, future or too-early date in plain words", () => {
    expect(check("")).toEqual({ ok: false, fieldErrors: { uploaded_on: "Enter the date you uploaded it, as dd/mm/yyyy" } });
    expect(check(null)).toMatchObject({ ok: false });
    for (const silly of ["yesterday", "31/02/2026", "11/13/2026", "2026", "=TODAY()"]) {
      expect(check(silly), silly).toEqual({ ok: false, fieldErrors: { uploaded_on: "Write the date as dd/mm/yyyy, for example 31/12/2026" } });
    }
    expect(check("13/11/2026")).toEqual({ ok: false, fieldErrors: { uploaded_on: "That date is in the future. Enter the day you uploaded it" } });
    expect(check("09/11/2026")).toEqual({ ok: false, fieldErrors: { uploaded_on: "This was downloaded on 10/11/2026, so it can't have been uploaded before then" } });
  });

  it("just after midnight in Johannesburg, today is already allowed", () => {
    expect(checkUploadMark({ uploadedOn: "13/11/2026", reference: "", producedAt, now: new Date("2026-11-12T22:30:00Z") })).toMatchObject({ ok: true, uploadedOn: "2026-11-13" });
  });

  it("keeps the reference to one short line of plain text, never an ID number", () => {
    expect(check("11/11/2026", "x".repeat(MAX_UPLOAD_REFERENCE))).toMatchObject({ ok: true });
    expect(check("11/11/2026", "x".repeat(MAX_UPLOAD_REFERENCE + 1))).toEqual({ ok: false, fieldErrors: { upload_reference: "Please keep the reference to 40 characters or fewer" } });
    expect(check("11/11/2026", "x".repeat(100_000))).toMatchObject({ ok: false });
    expect(check("11/11/2026", "line one\nline two‮")).toMatchObject({ ok: true, reference: "line one line two" });
    for (const id of ["8001015009087", "ref 800101 5009 087", "800101-5009-087"]) {
      expect(check("11/11/2026", id), id).toEqual({ ok: false, fieldErrors: { upload_reference: "That looks like an ID number. Use your eFiling reference only, never a donor's details" } });
    }
    // Thirteen digits that aren't an ID number are a reference like any other.
    expect(check("11/11/2026", "1234567890123")).toMatchObject({ ok: true, reference: "1234567890123" });
    expect(check("11/11/2026", "<b>=cmd</b>")).toMatchObject({ ok: true, reference: "<b>=cmd</b>" });
  });

  it("reports both problems at once, with no exclamation marks", () => {
    const r = check("soon", "y".repeat(41));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(["upload_reference", "uploaded_on"]);
    expect(Object.values(r.fieldErrors).join(" ")).not.toMatch(/!/);
  });
});
