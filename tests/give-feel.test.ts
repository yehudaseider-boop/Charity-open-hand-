import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { celebratesOutcome, giveButtonLabel, giveWaitingLine, SLOW_AFTER_MS } from "@/lib/donations/give-feel";

const base = { pending: false, slow: false, ready: true, total: "R210", monthly: false };

describe("the website's Give button words", () => {
  it("says what it is doing while the gift is secured, and owns up when it is slow", () => {
    expect(giveButtonLabel({ ...base, pending: true })).toBe("Securing your gift…");
    expect(giveButtonLabel({ ...base, pending: true, slow: true })).toBe("Still working on it…");
  });

  it("keeps the existing words when nothing is pending", () => {
    expect(giveButtonLabel({ ...base, ready: false })).toBe("Loading…");
    expect(giveButtonLabel({ ...base, total: null })).toBe("Give");
    expect(giveButtonLabel(base)).toBe("Give R210");
    expect(giveButtonLabel({ ...base, monthly: true })).toBe("Give R210 every month");
  });

  it("a slow flag means nothing unless the gift is pending", () => {
    expect(giveButtonLabel({ ...base, slow: true })).toBe("Give R210");
  });

  it("always says nothing is charged yet, and never has exclamation marks or em dashes", () => {
    for (const slow of [false, true]) {
      const line = giveWaitingLine(slow);
      expect(line).toContain("Nothing is charged until you confirm on the payment page.");
      expect(line).not.toMatch(/[!—]/);
    }
    expect(giveButtonLabel({ ...base, pending: true })).not.toMatch(/[!—]/);
    expect(SLOW_AFTER_MS).toBeGreaterThanOrEqual(3000);
  });
});

describe("the thank-you page's success moment", () => {
  it("is for a paid gift and nothing else", () => {
    expect(celebratesOutcome("paid")).toBe(true);
    for (const o of ["pending", "failed", "not_found", "review", "reversed", "refunded", "unknown", "", "Paid"]) expect(celebratesOutcome(o)).toBe(false);
  });

  it("the page only uses the paid look inside a paid outcome", () => {
    const lines = readFileSync("src/app/donate/return/page.tsx", "utf8").split("\n");
    const uses = lines.map((l, i) => (l.includes('tone="paid"') ? i : -1)).filter((i) => i >= 0);
    expect(uses.length).toBeGreaterThan(0);
    for (const i of uses) {
      const above = lines.slice(Math.max(0, i - 25), i).reverse().find((l) => l.includes("outcome ===") || l.includes("outcome !=="));
      expect(above, `line ${i + 1}`).toMatch(/outcome === "paid"/);
    }
  });
});
