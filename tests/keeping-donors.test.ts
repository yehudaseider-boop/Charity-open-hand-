/**
 * Keeping donors (CRM step 16): the tax-year windows, the counts, the lists and what an erased donor shows.
 * The rows themselves come from charity_keeping_donors (see keeping-donors-db.test.ts).
 */
import { describe, expect, it } from "vitest";
import {
  inList,
  keepingCsvRows,
  keepingDetails,
  keepingListKey,
  keepingListRows,
  keepingSummary,
  keepingWindow,
  keepingYearKey,
  retentionSentence,
  toKeepingRow,
  wholePercent,
  type KeepingRow,
} from "@/lib/charity/keeping-donors";
import { ERASED_DONOR } from "@/lib/charity/dashboard";

const row = (o: Partial<KeepingRow> = {}): KeepingRow => ({
  donor_id: "d1",
  this_cents: 0,
  last_cents: 0,
  earlier_cents: 0,
  last_paid_at: "2026-01-10T08:00:00Z",
  recorded_only: false,
  erased: false,
  donor_type: "individual",
  display_name: "Thandi Mokoena",
  email: "thandi@x.test",
  phone: "0821234567",
  ...o,
});

describe("the tax-year windows", () => {
  it("starts the tax year at midnight on 1 March, Johannesburg time", () => {
    // 23:59:59 on 28 February 2026 in Johannesburg is still the 2025/26 tax year.
    const before = keepingWindow("this", new Date("2026-02-28T21:59:59Z"));
    expect(before.taxYear).toBe(2026);
    expect(before.thisFrom).toBe("2025-03-01T00:00:00+02:00");
    expect(before.thisTo).toBe("2026-03-01T00:00:00+02:00");
    expect(before.lastFrom).toBe("2024-03-01T00:00:00+02:00");
    // One second later it is the 2026/27 tax year.
    const after = keepingWindow("this", new Date("2026-02-28T22:00:00Z"));
    expect(after.taxYear).toBe(2027);
    expect(after.thisFrom).toBe("2026-03-01T00:00:00+02:00");
    expect(after.lastName).toBe("2025/26");
    expect(after.thisName).toBe("2026/27");
    expect(after.running).toBe(true);
  });

  it("handles a leap year: 29 February is the last day", () => {
    const w = keepingWindow("this", new Date("2028-02-29T21:59:59Z"));
    expect(w.taxYear).toBe(2028);
    expect(w.thisTo).toBe("2028-03-01T00:00:00+02:00");
    expect(w.words).toContain("29/02/2028");
  });

  it("last tax year is finished, so its totals are not 'so far'", () => {
    const w = keepingWindow("last", new Date("2026-11-10T08:00:00Z"));
    expect(w.taxYear).toBe(2026);
    expect(w.running).toBe(false);
    expect(w.thisFrom).toBe("2025-03-01T00:00:00+02:00");
    expect(w.thisTo).toBe("2026-03-01T00:00:00+02:00");
  });

  it("reads only the choices it knows from the address", () => {
    expect(keepingYearKey("last")).toBe("last");
    expect(keepingYearKey("2019")).toBe("this");
    expect(keepingYearKey(undefined)).toBe("this");
    expect(keepingListKey("sybunt")).toBe("sybunt");
    expect(keepingListKey("<script>")).toBe("lybunt");
  });
});

describe("the counts", () => {
  it("counts last year's donors who gave again, with whole-number percentages", () => {
    const s = keepingSummary([
      row({ last_cents: 10_000, this_cents: 5_000 }), // gave less
      row({ last_cents: 10_000, this_cents: 20_000 }), // gave more
      row({ last_cents: 10_000, this_cents: 10_000 }), // the same
      row({ last_cents: 30_000 }), // last year, not this one
      row({ earlier_cents: 50_000 }), // an earlier year, not since
      row({ earlier_cents: 5_000, this_cents: 1_000 }), // came back after a gap: in no list
    ]);
    expect(s.lastYearDonors).toBe(4);
    expect(s.gaveAgain).toBe(3);
    expect(s.percent).toBe(75);
    expect(s.counts).toEqual({ lybunt: 1, sybunt: 1, more: 1, less: 1 });
    expect(s.lybuntLastYearCents).toBe(30_000);
  });

  it("has nothing to divide by when nobody gave last year", () => {
    const s = keepingSummary([]);
    expect(s).toMatchObject({ lastYearDonors: 0, gaveAgain: 0, percent: null, lybuntLastYearCents: 0 });
    expect(retentionSentence(s, { running: true, lastName: "2025/26" })).toBe("Nobody gave in the 2025/26 tax year, so there's nobody to compare yet.");
  });

  it("rounds half up and never goes above 100 or below 0", () => {
    expect(wholePercent(1, 3)).toBe(33);
    expect(wholePercent(2, 3)).toBe(67);
    expect(wholePercent(1, 8)).toBe(13); // 12.5 rounds up
    expect(wholePercent(5, 4)).toBe(100);
    expect(wholePercent(-1, 4)).toBe(0);
    expect(wholePercent(1, 0)).toBeNull();
  });

  it("says 'so far' while the year is running, and shows the counts behind the percentage", () => {
    const s = keepingSummary([row({ last_cents: 100, this_cents: 100 }), row({ last_cents: 100 })]);
    expect(retentionSentence(s, { running: true, lastName: "2025/26" })).toBe("50% of last tax year's donors have given again so far (1 of 2).");
    expect(retentionSentence(s, { running: false, lastName: "2024/25" })).toBe("50% of last tax year's donors gave again (1 of 2).");
  });

  it("keeps huge totals in whole cents", () => {
    const big = 9_000_000_000_000; // R90 billion
    const s = keepingSummary([row({ last_cents: big }), row({ last_cents: big })]);
    expect(s.lybuntLastYearCents).toBe(2 * big);
    expect(keepingCsvRows([row({ last_cents: big })], "lybunt")[0][5]).toBe("90000000000.00");
  });
});

describe("the lists", () => {
  it("puts each donor in the right lists", () => {
    expect(inList({ last_cents: 1, this_cents: 0, earlier_cents: 0 }, "lybunt")).toBe(true);
    expect(inList({ last_cents: 1, this_cents: 0, earlier_cents: 9 }, "sybunt")).toBe(false);
    expect(inList({ last_cents: 0, this_cents: 0, earlier_cents: 9 }, "sybunt")).toBe(true);
    // A donor who stopped this year isn't "gave less": they're in "last year, not this one".
    expect(inList({ last_cents: 100, this_cents: 0, earlier_cents: 0 }, "less")).toBe(false);
    expect(inList({ last_cents: 100, this_cents: 100, earlier_cents: 0 }, "more")).toBe(false);
    expect(inList({ last_cents: 100, this_cents: 100, earlier_cents: 0 }, "less")).toBe(false);
  });

  it("sorts the biggest first, then the most recent gift", () => {
    const rows = [
      row({ donor_id: "a", last_cents: 5_000, last_paid_at: "2025-05-01T08:00:00Z" }),
      row({ donor_id: "b", last_cents: 9_000, last_paid_at: "2025-04-01T08:00:00Z" }),
      row({ donor_id: "c", last_cents: 5_000, last_paid_at: "2025-09-01T08:00:00Z" }),
    ];
    expect(keepingListRows(rows, "lybunt").map((r) => r.donor_id)).toEqual(["b", "c", "a"]);
    const changes = [row({ donor_id: "x", last_cents: 1_000, this_cents: 9_000 }), row({ donor_id: "y", last_cents: 1_000, this_cents: 2_000 })];
    expect(keepingListRows(changes, "more").map((r) => r.donor_id)).toEqual(["x", "y"]);
  });

  it("shows nothing about an erased donor, whatever the row holds", () => {
    const d = keepingDetails(row({ erased: true }));
    expect(d).toEqual({ name: ERASED_DONOR, email: null, phone: null, lastPaidAt: null, donorId: null });
    expect(keepingDetails(row({ email: "erased+1@erased.invalid" })).name).toBe(ERASED_DONOR);
    const [csv] = keepingCsvRows([row({ erased: true, last_cents: 2_500 })], "lybunt");
    expect(csv.slice(0, 4)).toEqual([ERASED_DONOR, null, "", ""]);
    // An erased donor still counts in the numbers.
    expect(keepingSummary([row({ erased: true, last_cents: 2_500 })]).lastYearDonors).toBe(1);
  });

  it("reads the database's text amounts as whole cents, and anything odd as zero", () => {
    const r = toKeepingRow({ donor_id: "d", this_cents: "12345", last_cents: "-5", earlier_cents: "abc", recorded_only: true, erased: false });
    expect(r).toMatchObject({ this_cents: 12_345, last_cents: 0, earlier_cents: 0, recorded_only: true, erased: false, email: null });
  });

  it("writes a download with Rand amounts and the recorded-only flag", () => {
    const [csv] = keepingCsvRows([row({ last_cents: 125_000, this_cents: 0, earlier_cents: 3_457, recorded_only: true })], "lybunt");
    expect(csv).toEqual(["Thandi Mokoena", "thandi@x.test", "082 123 4567", "10/01/2026", "0.00", "1250.00", "34.57", "Yes"]);
  });
});
