import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { monthlyAttention } from "@/lib/charity/insights";
import {
  LAPSED_CSV_HEADER, lapsedCsvRows, lapsedDetails, lapsedPeriod, lapsedPeriodKey, lapsedReason, lapsedReasonLabel, lapsedSummary, sortLapsed,
  type LapsedRow,
} from "@/lib/charity/lapsed-monthly";

const row = (o: Partial<LapsedRow> = {}): LapsedRow => ({
  recurring_id: "r1", donor_id: "d1", amount_cents: 18_000, ended_at: "2026-10-01T10:00:00Z", last_paid_at: "2026-09-15T08:00:00Z",
  reason: "cancelled", donor_type: "individual", display_name: "Sarah Levin", email: "sarah@x.test", phone: "0821234567", ...o,
});

describe("the period", () => {
  it("is this tax year unless one of ours is asked for", () => {
    expect(lapsedPeriodKey(undefined)).toBe("tax-year");
    expect(lapsedPeriodKey("everything")).toBe("tax-year");
    expect(lapsedPeriodKey(["30-days"])).toBe("tax-year");
    expect(lapsedPeriodKey("last-tax-year")).toBe("last-tax-year");
    expect(lapsedPeriodKey("30-days")).toBe("30-days");
  });

  it("this tax year runs from 1 March to the end of February, Johannesburg time", () => {
    const p = lapsedPeriod("tax-year", new Date("2026-11-10T09:00:00+02:00"));
    expect(p).toMatchObject({ from: "2026-03-01T00:00:00+02:00", to: "2027-03-01T00:00:00+02:00" });
    expect(p.words).toBe("the 2026/27 tax year (01/03/2026 to 28/02/2027)");
  });

  it("changes tax year at midnight in Johannesburg, not in UTC", () => {
    // 28 February 23:30 in Johannesburg is still the old tax year; 1 March 00:30 (22:30 UTC the day before) is the new one.
    expect(lapsedPeriod("tax-year", new Date("2027-02-28T23:30:00+02:00")).from).toBe("2026-03-01T00:00:00+02:00");
    expect(lapsedPeriod("tax-year", new Date("2027-02-28T22:30:00Z")).from).toBe("2027-03-01T00:00:00+02:00");
  });

  it("last tax year ends exactly where this one starts, leap day included", () => {
    const p = lapsedPeriod("last-tax-year", new Date("2028-06-01T12:00:00+02:00"));
    expect(p).toMatchObject({ from: "2027-03-01T00:00:00+02:00", to: "2028-03-01T00:00:00+02:00" });
    expect(p.words).toBe("the 2027/28 tax year (01/03/2027 to 29/02/2028)");
    expect(p.to).toBe(lapsedPeriod("tax-year", new Date("2028-06-01T12:00:00+02:00")).from);
  });

  it("the last 30 days is the same rolling window the overview counts", () => {
    const now = new Date("2026-11-10T09:00:00+02:00");
    const p = lapsedPeriod("30-days", now);
    expect(p.to).toBe(now.toISOString());
    expect(new Date(p.to).getTime() - new Date(p.from).getTime()).toBe(30 * 86_400_000);
    const at = (iso: string) => monthlyAttention([{ status: "cancelled", retrying: false, paused_at: null, ended_at: iso, amount_cents: 100 }], now).endedRecently;
    expect(at(p.from)).toBe(1);
    expect(at(new Date(new Date(p.from).getTime() - 1).toISOString())).toBe(0);
  });
});

describe("what the charity sees", () => {
  it("says why it ended in plain words, and never passes an unknown reason through", () => {
    expect(lapsedReasonLabel.cancelled).toBe("The donor cancelled it");
    expect(lapsedReasonLabel.declined).toBe("The card kept failing");
    expect(lapsedReasonLabel.dispute).toMatch(/disputed/);
    expect(lapsedReasonLabel.erased).toBe("A donor who erased their information");
    expect(lapsedReason("declined")).toBe("declined");
    expect(lapsedReason("the card was declined every time we tried this month")).toBe("other");
    expect(lapsedReason("toString")).toBe("other");
    expect(lapsedReason(null)).toBe("other");
    for (const label of Object.values(lapsedReasonLabel)) expect(label).not.toMatch(/!/);
  });

  it("shows the name, contact details, last gift and a link to the donor's page", () => {
    expect(lapsedDetails(row())).toEqual({ name: "Sarah Levin", email: "sarah@x.test", phone: "0821234567", lastPaidAt: "2026-09-15T08:00:00Z", donorId: "d1" });
    expect(lapsedDetails(row({ display_name: "  ", phone: " " }))).toMatchObject({ name: "Donor", phone: null });
  });

  it("shows nothing about an erased donor, even if a row still carried details", () => {
    const nothing = { name: "Erased at the donor's request", email: null, phone: null, lastPaidAt: null, donorId: null };
    expect(lapsedDetails(row({ reason: "erased" }))).toEqual(nothing);
    expect(lapsedDetails(row({ reason: "cancelled", email: "erased+abc@erased.invalid" }))).toEqual(nothing);
    const csv = lapsedCsvRows([row({ reason: "erased" })])[0];
    expect(csv).toEqual(["Erased at the donor's request", null, "", "180.00", "", "01/10/2026", "A donor who erased their information"]);
  });

  it("adds up the donors and the Rand a month in whole cents", () => {
    expect(lapsedSummary([])).toEqual({ count: 0, centsPerMonth: 0 });
    expect(lapsedSummary([row({ amount_cents: 18_000 }), row({ amount_cents: 3_457 })])).toEqual({ count: 2, centsPerMonth: 21_457 });
  });

  it("sorts newest first", () => {
    const rows = [row({ recurring_id: "a", ended_at: "2026-05-01T10:00:00Z" }), row({ recurring_id: "b", ended_at: "2026-10-01T10:00:00Z" }), row({ recurring_id: "c", ended_at: "2026-07-01T10:00:00Z" })];
    expect(sortLapsed(rows).map((r) => r.recurring_id)).toEqual(["b", "c", "a"]);
  });
});

describe("the download", () => {
  it("has one cell for each heading, with dates and Rand as the dashboard writes them", () => {
    const [r] = lapsedCsvRows([row({ ended_at: "2026-09-30T22:30:00Z" })]);
    expect(r).toHaveLength(LAPSED_CSV_HEADER.length);
    // 22:30 UTC on 30 September is already 1 October in Johannesburg.
    expect(r).toEqual(["Sarah Levin", "sarah@x.test", "082 123 4567", "180.00", "15/09/2026", "01/10/2026", "The donor cancelled it"]);
  });

  it("can't run a formula or break out of its cell", () => {
    const csv = toCsv(LAPSED_CSV_HEADER, lapsedCsvRows([row({ display_name: "=HYPERLINK(\"http://x\",\"Sarah\")", email: "+cmd@x.test", phone: "@SUM(1)" }), row({ recurring_id: "r2", display_name: "Levin; =1+1, \"Trust\"" })]));
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith(csvCell("=HYPERLINK(\"http://x\",\"Sarah\")"))).toBe(true);
    expect(lines[1]).toContain("'=HYPERLINK");
    expect(lines[1]).toContain("'+cmd@x.test");
    expect(lines[1]).toContain("'@SUM(1)");
    expect(lines[2]).toContain("\"Levin; '=1+1, \"\"Trust\"\"\"");
  });
});
