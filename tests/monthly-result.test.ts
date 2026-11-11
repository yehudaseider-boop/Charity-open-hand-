/** What the account page says after a monthly donation is paused, resumed, cancelled or removed (11/11/2026). */
import { describe, expect, it } from "vitest";
import { isMonthlyChange, monthlyChangeFor, monthlyResult, monthlyResultTitle } from "@/lib/donations/monthly-result";

describe("monthly donation results", () => {
  it("maps the new status to what changed", () => {
    expect(monthlyChangeFor("paused", false)).toBe("paused");
    expect(monthlyChangeFor("active", false)).toBe("resumed");
    expect(monthlyChangeFor("cancelled", false)).toBe("cancelled");
    expect(monthlyChangeFor("cancelled", true)).toBe("removed");
    expect(monthlyChangeFor("failed", false)).toBeNull();
  });

  it("only accepts the four known changes from the address", () => {
    expect(["paused", "resumed", "cancelled", "removed"].every(isMonthlyChange)).toBe(true);
    expect(isMonthlyChange("done")).toBe(false);
    expect(isMonthlyChange("<script>")).toBe(false);
    expect(isMonthlyChange(["paused"])).toBe(false);
  });

  it("pausing says nothing is collected and offers Resume", () => {
    const r = monthlyResult("paused", null);
    expect(monthlyResultTitle(r, "Sample  Soup Kitchen")).toBe("Paused your monthly donation to Sample Soup Kitchen.");
    expect(r.next).toMatch(/Nothing will be collected until you resume/);
    expect(r.undo).toEqual({ status: "active", label: "Resume" });
  });

  it("resuming names the next date only when it is known, and offers Pause", () => {
    expect(monthlyResult("resumed", "03/12/2026").next).toBe("The next donation is on 03/12/2026.");
    expect(monthlyResult("resumed", null).next).not.toMatch(/\d/);
    expect(monthlyResult("resumed", null).undo).toEqual({ status: "paused", label: "Pause" });
  });

  it("cancelling and removing can't be taken back and say nothing more is collected", () => {
    for (const c of ["cancelled", "removed"] as const) {
      const r = monthlyResult(c, null);
      expect(r.undo).toBeNull();
      expect(r.next).toMatch(/Nothing more will be collected/);
    }
    expect(monthlyResultTitle(monthlyResult("removed", null), null)).toBe("Removed the stopped monthly donation from your list.");
  });

  it("uses house wording: no exclamation marks or em dashes", () => {
    for (const c of ["paused", "resumed", "cancelled", "removed"] as const) {
      const r = monthlyResult(c, "01/01/2027");
      expect(`${r.lead}${r.end} ${r.next}`).not.toMatch(/[!—]/);
    }
  });
});
