import { describe, expect, it } from "vitest";
import { formatPpmAsPercent, formatRand, parseRandToCents, percentToPpm } from "@/lib/money";

describe("formatRand", () => {
  it.each([
    [0, "R0.00"],
    [5, "R0.05"],
    [3_000, "R30.00"],
    [125_000, "R1 250.00"],
    [123_456_789, "R1 234 567.89"],
    [-5_000, "-R50.00"],
  ])("%i cents -> %s", (cents, expected) => {
    expect(formatRand(cents)).toBe(expected);
  });
});

describe("parseRandToCents", () => {
  it.each([
    ["30", 3_000],
    ["1250", 125_000],
    ["1 250", 125_000],
    ["R1 250.50", 125_050],
    ["1250,5", 125_050],
    ["0.07", 7],
  ])("%s -> %i", (input, expected) => {
    expect(parseRandToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "12.345", "-5", "1.2.3"])("rejects %s", (input) => {
    expect(parseRandToCents(input)).toBeNull();
  });
});

describe("percentToPpm", () => {
  it("converts exactly, with no floating point", () => {
    expect(percentToPpm("3")).toBe(30_000);
    expect(percentToPpm("15")).toBe(150_000);
    expect(percentToPpm("2.9")).toBe(29_000);
    expect(percentToPpm("0.0001")).toBe(1);
  });
  it("rejects bad input", () => {
    expect(() => percentToPpm("100")).toThrow();
    expect(() => percentToPpm("3%")).toThrow();
    expect(() => percentToPpm("1.23456")).toThrow();
  });
  it("formats back", () => {
    expect(formatPpmAsPercent(30_000)).toBe("3%");
    expect(formatPpmAsPercent(29_500)).toBe("2.95%");
  });
});
