/**
 * The "Gives monthly" and "Monthly paused" badges on the Donors list come from the monthly donations themselves
 * (26/11/2026: the page used to read every monthly gift to work them out, and was the slowest dashboard page).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const { monthlyStatusFrom } = await import("@/lib/charity/monthly-status");

describe("which donors give monthly", () => {
  it("one badge per donor: active wins over paused, whatever the order", () => {
    const m = monthlyStatusFrom([
      { donor_id: "a", status: "paused" },
      { donor_id: "a", status: "active" },
      { donor_id: "b", status: "paused" },
      { donor_id: "c", status: "active" },
      { donor_id: "c", status: "paused" },
    ]);
    expect([...m.entries()].sort()).toEqual([["a", "active"], ["b", "paused"], ["c", "active"]]);
  });

  it("a donor with no running or paused monthly donation has no badge", () => {
    expect(monthlyStatusFrom([{ donor_id: "a", status: "cancelled" }, { donor_id: "b", status: "pending" }]).size).toBe(0);
  });
});
