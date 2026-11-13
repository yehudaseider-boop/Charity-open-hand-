import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { celebratesOutcome, GIVE_GAVE_UP_MESSAGE, GIVE_GIVE_UP_MS, giveButtonLabel, giveWaitingLine, SLOW_AFTER_MS } from "@/lib/donations/give-feel";

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

describe("opening the payment page, and never waiting for ever (13/11/2026)", () => {
  it("says the payment page is opening once the server has answered", () => {
    expect(giveButtonLabel({ ...base, opening: true })).toBe("Opening the payment page…");
    expect(giveButtonLabel({ ...base, opening: true, pending: true, slow: true })).toBe("Opening the payment page…");
  });

  it("stops waiting after a while, longer than the server's own limit, says nothing was charged and offers Try again", () => {
    expect(GIVE_GIVE_UP_MS).toBeGreaterThan(30_000);
    expect(GIVE_GAVE_UP_MESSAGE).toContain("Nothing was charged.");
    expect(GIVE_GAVE_UP_MESSAGE).toContain("Try again");
    // Only what the form's draft really keeps: never ID or tax numbers or ticks (POPIA, fresh consent).
    expect(GIVE_GAVE_UP_MESSAGE).toContain("the ticks and any ID or tax number need doing again");
    expect(GIVE_GAVE_UP_MESSAGE).not.toMatch(/[!—]/);
    expect(giveButtonLabel({ ...base, pending: true, slow: true, gaveUp: true })).toBe("Stopped waiting");
    // Only while still waiting: a stale flag never changes the button.
    expect(giveButtonLabel({ ...base, gaveUp: true })).toBe("Give R210");
  });

  it("the give form no longer redirects from the server, and offers a link to the payment page", () => {
    const action = readFileSync("src/app/c/[slug]/donate/actions.ts", "utf8");
    expect(action).not.toMatch(/\bredirect\(/);
    expect(action).toContain("return { ok: true, redirectUrl: result.redirectUrl }");
    const form = readFileSync("src/app/c/[slug]/donate/donate-flow.tsx", "utf8");
    expect(form).toContain("window.location.assign(opening)");
    expect(form).toContain("Continue to the payment page");
    // Try again opens the form afresh (the lost answer would otherwise hold up a second press), with the amount kept.
    expect(form).toContain("useSlowAfter(pending, GIVE_GIVE_UP_MS)");
    expect(form).toMatch(/searchParams\.set\("cents", String\(quote\.amountCents\)\)/);
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
