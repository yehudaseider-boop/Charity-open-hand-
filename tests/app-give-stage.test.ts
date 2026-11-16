import { describe, expect, it } from "vitest";
import { celebrates, labelWait, LABEL_MIN_MS, stageLabel, TICK_MS } from "../apps/mobile/src/lib/give-stage";

describe("what the Give button says while a gift goes through", () => {
  it("names the real stage, in order, for a payment page", () => {
    expect(stageLabel("securing", false)).toBe("Securing your gift…");
    expect(stageLabel("opening", false)).toBe("Opening the payment page…");
    expect(stageLabel("checking", false)).toBe("Checking your payment…");
  });

  it("says a saved card is being charged, and never mentions a payment page for it", () => {
    expect(stageLabel("securing", true)).toBe("Charging your card…");
    expect(stageLabel("checking", true)).toBe("Checking your payment…");
  });

  it("has plain words and no exclamation marks or em dashes", () => {
    for (const stage of ["securing", "opening", "checking", false] as const) {
      for (const saved of [true, false]) {
        const text = stageLabel(stage, saved);
        expect(text).not.toMatch(/[!—]/);
      }
    }
  });
});

describe("the success moment", () => {
  it("is for a gift the provider confirmed as paid, and nothing else", () => {
    expect(celebrates("paid")).toBe(true);
    for (const outcome of ["pending", "unknown", "failed", "not_found", "reversed", "review", "refunded", "", "PAID", "paid "]) {
      expect(celebrates(outcome)).toBe(false);
    }
  });

  it("holds the tick for well under a second", () => {
    expect(TICK_MS).toBeGreaterThan(0);
    expect(TICK_MS).toBeLessThanOrEqual(700);
  });
});

describe("how long a stage's words stay up", () => {
  it("waits out the rest of the minimum, never longer", () => {
    expect(labelWait(1000, 1000)).toBe(LABEL_MIN_MS);
    expect(labelWait(1000, 1250)).toBe(LABEL_MIN_MS - 250);
    expect(labelWait(1000, 1000 + LABEL_MIN_MS)).toBe(0);
    expect(labelWait(1000, 99_000)).toBe(0);
  });
});
