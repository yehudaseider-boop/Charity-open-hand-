/**
 * Part refunds in the charity's money views (code review 20/11/2026): a R1 000 gift refunded R400 counts R600
 * everywhere, as on its s18A receipt, and a gift refunded in full in parts counts as a refund, not a gift.
 */
import { describe, expect, it } from "vitest";
import { countsAsGift, leftCents, partRefundNote, refundedInParts } from "@/lib/donations/what-is-left";
import { donationAmountColumns } from "@/lib/charity/donation-export";

describe("what is left of a gift", () => {
  it("is the gift less its part refunds, never below R0, with cents as text or numbers", () => {
    expect(leftCents({ amount_cents: 100_000, refunded_cents: 40_000 })).toBe(60_000);
    expect(leftCents({ amount_cents: "100000", refunded_cents: "40000" })).toBe(60_000);
    expect(leftCents({ amount_cents: 18_000 })).toBe(18_000);
    expect(leftCents({ amount_cents: 18_000, refunded_cents: null })).toBe(18_000);
    expect(leftCents({ amount_cents: 1_000, refunded_cents: 5_000 })).toBe(0);
  });

  it("a paid gift with nothing left is a refund, not a gift", () => {
    expect(countsAsGift({ status: "paid", amount_cents: 100_000, refunded_cents: 40_000 })).toBe(true);
    expect(countsAsGift({ status: "paid", amount_cents: 100_000, refunded_cents: 100_000 })).toBe(false);
    expect(refundedInParts({ status: "paid", amount_cents: 100_000, refunded_cents: 100_000 })).toBe(true);
    expect(refundedInParts({ status: "paid", amount_cents: 100_000, refunded_cents: 40_000 })).toBe(false);
    expect(countsAsGift({ status: "refunded", amount_cents: 100_000, refunded_cents: 0 })).toBe(false);
    expect(refundedInParts({ status: "refunded", amount_cents: 100_000, refunded_cents: 100_000 })).toBe(false);
  });

  it("says a part refund plainly, and nothing when there was none", () => {
    expect(partRefundNote({ amount_cents: 100_000, refunded_cents: 40_000 })).toBe("R1 000, R400 refunded");
    expect(partRefundNote({ amount_cents: 3_457, refunded_cents: 1_000 })).toBe("R34.57, R10 refunded");
    expect(partRefundNote({ amount_cents: 100_000, refunded_cents: 0 })).toBeNull();
  });
});

describe("the donations download", () => {
  it("Amount is what is left, so a paid download adds up to income received; Refunded is the part refunds", () => {
    expect(donationAmountColumns({ amount_cents: 100_000, refunded_cents: 40_000 })).toEqual(["600.00", "400.00"]);
    expect(donationAmountColumns({ amount_cents: 3_457, refunded_cents: 0 })).toEqual(["34.57", "0.00"]);
    expect(donationAmountColumns({ amount_cents: 50_000, refunded_cents: 50_000 })).toEqual(["0.00", "500.00"]);
    // Huge amounts stay exact (no floats).
    expect(donationAmountColumns({ amount_cents: 9_007_199_254_740_991, refunded_cents: 1 })).toEqual(["90071992547409.90", "0.01"]);
  });
});
