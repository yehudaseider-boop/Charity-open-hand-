/**
 * Admin, Payments lists the part refunds already recorded on a gift next to the record form (26/11/2026), so a person
 * compares with the payment provider before typing one in and the same refund isn't counted twice.
 */
import { describe, expect, it } from "vitest";
import { refundsSoFar } from "@/lib/admin/refunds-so-far";

describe("part refunds already recorded, in words", () => {
  it("lists each gift's refunds oldest first: amount, who told us, and the date in Johannesburg time", () => {
    const lines = refundsSoFar([
      { donation_id: "d1", amount_cents: 10_050, source: "admin:e1", created_at: "2026-11-25T23:30:00Z" },
      { donation_id: "d1", amount_cents: 40_000, source: "gateway_event:g1", created_at: "2026-11-20T08:00:00Z" },
      { donation_id: "d2", amount_cents: 3_000, source: "gateway_event:g2", created_at: "2026-11-21T08:00:00Z" },
    ]);
    expect(lines.get("d1")).toEqual(["R400 · the payment provider told us · 20/11/2026", "R100.50 · recorded here by hand · 26/11/2026"]);
    expect(lines.get("d2")).toEqual(["R30 · the payment provider told us · 21/11/2026"]);
  });

  it("a gift with none recorded has no lines (the page says None yet.)", () => {
    expect(refundsSoFar([]).get("d1")).toBeUndefined();
  });
});
