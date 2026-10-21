/** The charity's s18A progress per tax year, and who gives monthly on the donor list. */
import { describe, expect, it } from "vitest";
import { monthlyByDonor, receiptProgress } from "@/lib/charity/insights";

const gift = (id: string, donor: string, year: number, cents: number, extra: Partial<{ wants_18a: boolean; status: string }> = {}) => ({
  id, donor_id: donor, tax_year: year, amount_cents: cents, wants_18a: true, status: "paid", ...extra,
});

describe("s18A receipt progress", () => {
  it("counts donors per tax year, newest first, and what is still waiting", () => {
    const gifts = [
      gift("a1", "ann", 2026, 50_000),
      gift("a2", "ann", 2026, 25_000),
      gift("b1", "ben", 2026, 10_000),
      gift("c1", "cara", 2027, 18_000),
    ];
    const issued = new Set(["a1", "a2"]); // Ann's 2026 receipt is out; Ben's is not.
    expect(receiptProgress(gifts, issued, 2027)).toEqual([
      { taxYear: 2027, current: true, donors: 1, receipted: 0, waitingCents: 18_000 },
      { taxYear: 2026, current: false, donors: 2, receipted: 1, waitingCents: 10_000 },
    ]);
  });

  it("a donor with one gift left off still counts as waiting", () => {
    const gifts = [gift("a1", "ann", 2026, 50_000), gift("a2", "ann", 2026, 25_000)];
    expect(receiptProgress(gifts, new Set(["a1"]), 2027)[0]).toMatchObject({ donors: 1, receipted: 0, waitingCents: 25_000 });
  });

  it("ignores gifts that didn't ask for a receipt, and refunded or charged-back ones", () => {
    const gifts = [
      gift("a1", "ann", 2026, 50_000, { wants_18a: false }),
      gift("b1", "ben", 2026, 10_000, { status: "refunded" }),
      gift("c1", "cara", 2026, 9_000, { status: "charged_back" }),
    ];
    expect(receiptProgress(gifts, new Set(), 2027)).toEqual([]);
  });
});

describe("who gives monthly", () => {
  it("marks donors with a running monthly donation, and paused ones, from their own gifts", () => {
    const gifts = [
      { donor_id: "ann", recurring_id: "r1" },
      { donor_id: "ben", recurring_id: "r2" },
      { donor_id: "cara", recurring_id: "r3" },
      { donor_id: "dan", recurring_id: "r4" },
      { donor_id: "dan", recurring_id: "r5" },
    ];
    const monthly = [
      { recurring_id: "r1", status: "active" as const },
      { recurring_id: "r2", status: "paused" as const },
      { recurring_id: "r3", status: "cancelled" as const },
      { recurring_id: "r4", status: "paused" as const },
      { recurring_id: "r5", status: "active" as const },
    ];
    const m = monthlyByDonor(gifts, monthly);
    expect(m.get("ann")).toBe("active");
    expect(m.get("ben")).toBe("paused");
    expect(m.has("cara")).toBe(false);
    expect(m.get("dan")).toBe("active"); // one running beats one paused
  });
});
