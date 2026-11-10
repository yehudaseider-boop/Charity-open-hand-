import { describe, expect, it } from "vitest";
import { DEMO_CAUSES, DEMO_MAX_CENTS, DEMO_PRESETS_CENTS, demoSummary, monthsLeftInTaxYear, type DemoInput } from "@/lib/landing-demo";
import { platformConfig } from "@/config/platform";

// 10/11/2026 at noon in Johannesburg: inside the 2027 tax year (01/03/2026 to 28/02/2027).
const NOV = new Date("2026-11-10T10:00:00Z");
const base: DemoInput = { amount: { kind: "preset", cents: 10_000 }, frequency: "monthly", cause: "food", now: NOV };

describe("landing demo: tax-year months", () => {
  it("counts the months left from this month to the end of February", () => {
    expect(monthsLeftInTaxYear(new Date("2026-03-15T10:00:00Z"))).toBe(12);
    expect(monthsLeftInTaxYear(NOV)).toBe(4);
    expect(monthsLeftInTaxYear(new Date("2027-02-20T10:00:00Z"))).toBe(1);
    expect(monthsLeftInTaxYear(new Date("2026-12-31T10:00:00Z"))).toBe(3);
  });
  it("uses Johannesburg time at the turn of the tax year", () => {
    // 28/02/2027 23:30 UTC is already 01/03/2027 in Johannesburg: a new tax year, 12 months ahead.
    expect(monthsLeftInTaxYear(new Date("2027-02-28T23:30:00Z"))).toBe(12);
  });
  it("follows the configured start month", () => {
    expect(platformConfig.taxYear.startMonth).toBe(3);
  });
});

describe("landing demo: summary", () => {
  it("asks for an amount first, then a cause", () => {
    expect(demoSummary({ ...base, amount: null }).kind).toBe("empty");
    const noCause = demoSummary({ ...base, cause: null });
    expect(noCause).toMatchObject({ kind: "empty", message: "Pick a cause to finish the sample." });
  });

  it("works out a monthly gift in whole cents", () => {
    const r = demoSummary(base);
    expect(r).toMatchObject({ kind: "ready", cents: 10_000, giftsThisTaxYear: 4, receiptCents: 40_000, perYearCents: 120_000, taxYear: 2027, taxYearName: "2026/27", lastMonth: "February" });
    if (r.kind !== "ready") throw new Error("not ready");
    expect(Number.isInteger(r.receiptCents)).toBe(true);
    expect(r.summary).toBe("R100 every month to a sample charity for feeding families: R1 200 a year. Starting this month, your s18A receipt for the 2026/27 tax year would show R400.");
  });

  it("works out a once-off gift", () => {
    const r = demoSummary({ ...base, frequency: "once", amount: { kind: "preset", cents: 25_000 }, cause: "care" });
    expect(r).toMatchObject({ kind: "ready", giftsThisTaxYear: 1, receiptCents: 25_000, perYearCents: null });
    if (r.kind !== "ready") throw new Error("not ready");
    expect(r.summary).toBe("R250 once to a sample charity for care for older people. Your s18A receipt for the 2026/27 tax year would show R250.");
  });

  it("starting in March counts a whole tax year", () => {
    const r = demoSummary({ ...base, now: new Date("2027-03-05T10:00:00Z"), amount: { kind: "preset", cents: 5_000 } });
    expect(r).toMatchObject({ kind: "ready", receiptCents: 60_000, perYearCents: 60_000, taxYearName: "2027/28" });
  });

  it("reads a typed amount with cents and shows it the Rand way", () => {
    const r = demoSummary({ ...base, amount: { kind: "other", typed: "34.57" }, frequency: "once" });
    expect(r).toMatchObject({ kind: "ready", cents: 3_457 });
    if (r.kind !== "ready") throw new Error("not ready");
    expect(r.summary).toContain("R34.57");
    const big = demoSummary({ ...base, amount: { kind: "other", typed: "1250" } });
    expect(big).toMatchObject({ kind: "ready", cents: 125_000, perYearCents: 1_500_000 });
    if (big.kind === "ready") expect(big.summary).toContain("R15 000 a year");
  });

  it("handles empty, silly, too small and too big amounts plainly", () => {
    expect(demoSummary({ ...base, amount: { kind: "other", typed: "  " } })).toMatchObject({ kind: "empty" });
    expect(demoSummary({ ...base, amount: { kind: "other", typed: "lots" } })).toMatchObject({ kind: "error" });
    expect(demoSummary({ ...base, amount: { kind: "other", typed: "0" } })).toMatchObject({ kind: "error", message: "The smallest gift is R30." });
    expect(demoSummary({ ...base, amount: { kind: "other", typed: "29.99" } })).toMatchObject({ kind: "error" });
    expect(demoSummary({ ...base, amount: { kind: "other", typed: "30" } })).toMatchObject({ kind: "ready", cents: 3_000 });
    expect(demoSummary({ ...base, amount: { kind: "other", typed: "1000001" } })).toMatchObject({ kind: "error", message: "The demo shows gifts up to R1 000 000." });
    expect(demoSummary({ ...base, amount: { kind: "other", typed: String(DEMO_MAX_CENTS / 100) } }).kind).toBe("ready");
  });

  it("keeps the biggest monthly sample a safe whole number", () => {
    const r = demoSummary({ ...base, amount: { kind: "preset", cents: DEMO_MAX_CENTS }, now: new Date("2026-03-02T10:00:00Z") });
    expect(r).toMatchObject({ kind: "ready", receiptCents: DEMO_MAX_CENTS * 12 });
    if (r.kind === "ready") expect(Number.isSafeInteger(r.receiptCents)).toBe(true);
  });
});

describe("landing demo: content rules", () => {
  it("offers R50, R100 and R250, all above the minimum", () => {
    expect([...DEMO_PRESETS_CENTS]).toEqual([5_000, 10_000, 25_000]);
    for (const c of DEMO_PRESETS_CENTS) expect(c).toBeGreaterThanOrEqual(platformConfig.minDonationCents);
  });
  it("uses three sample causes with no numbers, no exclamation marks and no religious wording", () => {
    expect(DEMO_CAUSES).toHaveLength(3);
    for (const c of DEMO_CAUSES) {
      expect(c.label).not.toMatch(/\d|!|—|maaser|chomesh|tzedakah|church|mosque|shul|temple/i);
    }
  });
});

describe("landing demo: the component", () => {
  it("never talks to the network or stores anything, and leaves orange to the screen's one call to action", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/landing/try-demo.tsx", "utf8");
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|"use server"|action=/);
    expect(src).not.toMatch(/bg-coral|text-coral|border-coral/);
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/type="radio"/);
  });
});
