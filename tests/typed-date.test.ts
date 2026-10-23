/** Dates typed into the dashboard are read the South African way, never mm/dd. */
import { describe, expect, it } from "vitest";
import { showDay, typedDay } from "@/lib/typed-date";
import { checkReminder } from "@/lib/charity/donor-care-rules";
import { checkCampaign } from "@/lib/charity/campaigns";
import { parseDonationFilters } from "@/lib/charity/donation-filters";
import { parseGiftDate } from "@/lib/charity/recorded-gifts";

describe("typedDay", () => {
  it("reads dd/mm/yyyy, with any common separator, without separators, and yyyy-mm-dd", () => {
    for (const s of ["05/03/2026", "5/3/2026", "05.03.2026", "05-03-2026", "05 03 2026", " 05 / 03 / 2026 ", "05032026", "2026-03-05"]) expect(typedDay(s)).toBe("2026-03-05");
  });
  it("never reads it as mm/dd, and refuses days that don't exist", () => {
    expect(typedDay("03/05/2026")).toBe("2026-05-03");
    expect(typedDay("12/31/2026")).toBeNull();
    expect(typedDay("29/02/2027")).toBeNull();
    expect(typedDay("29/02/2028")).toBe("2028-02-29");
    expect(typedDay("31/04/2026")).toBeNull();
  });
  it("refuses empty, silly and two-digit-year input", () => {
    for (const s of ["05/03/0999", "20111205", "", "   ", "tomorrow", "5/3/26", "2026/03/05", "0/0/0000", "1234567", "<script>", null, undefined]) expect(typedDay(s)).toBeNull();
  });
  it("shows yyyy-mm-dd as dd/mm/yyyy and leaves anything else as typed", () => {
    expect(showDay("2026-10-23")).toBe("23/10/2026");
    expect(showDay("23/1O/2026")).toBe("23/1O/2026");
    expect(showDay(null)).toBe("");
  });
});

describe("the dashboard's date fields", () => {
  const today = "2026-10-23";
  it("a follow-up takes a typed date", () => {
    expect(checkReminder("Phone to thank", "24/10/2026", today)).toMatchObject({ ok: true, dueOn: "2026-10-24" });
    expect(checkReminder("Phone to thank", "22/10/2026", today)).toMatchObject({ ok: false, errors: { due_on: "Choose today or a later date" } });
    expect(checkReminder("Phone to thank", "10/24/2026", today)).toMatchObject({ ok: false, errors: { due_on: expect.stringContaining("dd/mm/yyyy") } });
  });
  it("a campaign's last day takes a typed date, and may be left empty", () => {
    const base = { title: "Winter blankets", target: "50000" };
    const r = checkCampaign({ ...base, ends_on: "31/12/2026" }, today);
    expect(r.ok && r.value.endsAt).toBe("2026-12-31T23:59:59+02:00");
    expect(checkCampaign({ ...base, ends_on: "" }, today)).toMatchObject({ ok: true, value: { endsAt: null } });
    expect(checkCampaign({ ...base, ends_on: "31/13/2026" }, today)).toMatchObject({ ok: false, fieldErrors: { ends_on: expect.stringContaining("dd/mm/yyyy") } });
    expect(checkCampaign({ ...base, ends_on: "01/10/2026" }, today)).toMatchObject({ ok: false, fieldErrors: { ends_on: "Choose today or a later date" } });
  });
  it("a recorded gift takes a typed date, without separators too", () => {
    expect(parseGiftDate("05032026", today)).toEqual({ date: "2026-03-05" });
    expect(parseGiftDate("31/02/2026", today)).toEqual({ error: expect.stringContaining("isn't a real date") });
    expect(parseGiftDate("last week", today)).toEqual({ error: expect.stringContaining("isn't a date we can read") });
  });
  it("the donations filter reads typed dates and our own links alike", () => {
    expect(parseDonationFilters({ period: "custom", from: "01/03/2026", to: "28/02/2027" })).toMatchObject({ period: "custom", fromDate: "2026-03-01", toDate: "2027-02-28" });
    expect(parseDonationFilters({ period: "custom", from: "2026-03-01", to: "2026-03-31" })).toMatchObject({ fromDate: "2026-03-01", toDate: "2026-03-31" });
    expect(parseDonationFilters({ period: "custom", from: "03/31/2026", to: "04/30/2026" })).toMatchObject({ period: "all", fromDate: null });
  });
});
