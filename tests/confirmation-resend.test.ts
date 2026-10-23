/** A confirmation email resent by the daily check describes the monthly donation as it is now. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { monthlyLineLater } = await import("@/lib/donations/notify");
const { NOT_REUSABLE } = await import("@/lib/donations/recurring");

const FIRST = "d-first";
const row = (o: Partial<Parameters<typeof monthlyLineLater>[1] & object> = {}) => ({ first_donation_id: FIRST, status: "active", ended_reason: null, charge_day: 15, card_last4: "4081", ...o });

describe("a resent confirmation", () => {
  it("calls a running monthly donation's first payment its first payment, with the day and card", () => {
    expect(monthlyLineLater(FIRST, row())).toEqual({ kind: "first", chargeDay: 15, cardLast4: "4081" });
  });
  it("says a later collection was the monthly donation", () => {
    expect(monthlyLineLater("d-later", row())).toEqual({ kind: "repeat" });
  });
  it("never promises another collection once the donor has paused or cancelled", () => {
    expect(monthlyLineLater(FIRST, row({ status: "paused" }))).toBeUndefined();
    expect(monthlyLineLater(FIRST, row({ status: "cancelled", ended_reason: "cancelled by the donor" }))).toBeUndefined();
  });
  it("says the monthly donation didn't start when the card could not be kept", () => {
    expect(monthlyLineLater(FIRST, row({ status: "cancelled", ended_reason: NOT_REUSABLE }))).toEqual({ kind: "not_started" });
  });
  it("is a plain gift when the monthly donation can't be found", () => {
    expect(monthlyLineLater(FIRST, null)).toBeUndefined();
  });
});
