import { describe, expect, it } from "vitest";
import { allTime, donorName, safeSearch, saDate, thisMonth, thisTaxYear } from "@/lib/charity/dashboard";
import { centsToPlain, csvCell, toCsv } from "@/lib/csv";

describe("csv export", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell('Levin, "Sarah"')).toBe('"Levin, ""Sarah"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(1250)).toBe("1250");
  });

  it("neutralises anything a spreadsheet could read as a formula", () => {
    for (const evil of ["=1+1", "+1+1", "-2+3", "@SUM(A1)", "=HYPERLINK(\"http://evil\")", "\tcmd", "+cmd|' /C calc'!A0"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });

  it("leaves ordinary numbers and phone numbers alone", () => {
    expect(csvCell("1250.00")).toBe("1250.00");
    expect(csvCell("-35.50")).toBe("-35.50");
    expect(csvCell("+27821234567")).toBe("+27821234567");
    expect(csvCell("082 123 4567")).toBe("082 123 4567");
  });

  it("writes a header, CRLF rows and a byte order mark (for accents and Hebrew)", () => {
    const text = toCsv(["Name", "Amount"], [["Sarah", "10.00"], ["דוד", "5.00"]]);
    expect(text.startsWith("﻿Name,Amount\r\n")).toBe(true);
    expect(text).toContain("דוד,5.00");
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("writes cents as Rand without any floating point", () => {
    expect(centsToPlain(125_050)).toBe("1250.50");
    expect(centsToPlain("5")).toBe("0.05");
    expect(centsToPlain(0)).toBe("0.00");
    expect(centsToPlain("9007199254740993")).toBe("90071992547409.93");
    expect(centsToPlain(-350)).toBe("-3.50");
  });
});

describe("dashboard periods (Johannesburg time)", () => {
  it("finds the Johannesburg date even late at night UTC", () => {
    expect(saDate(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });

  it("gives this calendar month, and rolls over December", () => {
    expect(thisMonth(new Date("2026-10-08T10:00:00Z"))).toEqual({ from: "2026-10-01T00:00:00+02:00", to: "2026-11-01T00:00:00+02:00" });
    expect(thisMonth(new Date("2026-12-15T10:00:00Z"))).toEqual({ from: "2026-12-01T00:00:00+02:00", to: "2027-01-01T00:00:00+02:00" });
  });

  it("gives the current SARS tax year, ending the day before 1 March", () => {
    expect(thisTaxYear(new Date("2026-10-08T10:00:00Z"))).toMatchObject({ taxYear: 2027, from: "2026-03-01T00:00:00+02:00", to: "2027-03-01T00:00:00+02:00", end: "2027-02-28" });
    expect(thisTaxYear(new Date("2027-02-28T10:00:00Z")).taxYear).toBe(2027);
    expect(thisTaxYear(new Date("2027-03-01T10:00:00Z"))).toMatchObject({ taxYear: 2028, to: "2028-03-01T00:00:00+02:00" });
    expect(thisTaxYear(new Date("2027-12-31T10:00:00Z")).to).toBe("2028-03-01T00:00:00+02:00"); // leap year 2028: 29 February
    expect(thisTaxYear(new Date("2028-01-10T10:00:00Z"))).toMatchObject({ taxYear: 2028, end: "2028-02-29" });
  });

  it("covers all time", () => {
    expect(allTime.from < "2026" && allTime.to > "2099").toBe(true);
  });
});

describe("names and search", () => {
  it("shows a person's name or the organisation's name", () => {
    expect(donorName({ donor_type: "individual", first_name: "Sarah", last_name: "Levin", organisation_name: null })).toBe("Sarah Levin");
    expect(donorName({ donor_type: "company", first_name: null, last_name: null, organisation_name: "Test Trading" })).toBe("Test Trading");
    expect(donorName({ donor_type: null, first_name: null, last_name: null, organisation_name: null })).toBe("Donor");
  });

  it("strips characters that could change a search filter", () => {
    expect(safeSearch("levin),email.neq.x,(a")).toBe("levin email neq x a");
    expect(safeSearch("  O'Brien  ")).toBe("O Brien");
    expect(safeSearch("a".repeat(200))).toHaveLength(60);
  });
});
