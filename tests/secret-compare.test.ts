/** The one constant-time comparison every scheduler key, signature and token check uses. */
import { describe, expect, it } from "vitest";
import { bearerMatches, sameSecret } from "@/lib/secret-compare";

const SECRET = "c".repeat(40);

describe("bearerMatches", () => {
  it("lets in the right secret", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("refuses a wrong secret of the same length", () => {
    expect(bearerMatches(`Bearer ${"c".repeat(39)}d`, SECRET)).toBe(false);
  });

  it("refuses a secret of a different length, shorter or longer", () => {
    expect(bearerMatches(`Bearer ${SECRET.slice(1)}`, SECRET)).toBe(false);
    expect(bearerMatches(`Bearer ${SECRET}c`, SECRET)).toBe(false);
    expect(bearerMatches(SECRET, SECRET)).toBe(false);
  });

  it("refuses a missing or empty header", () => {
    expect(bearerMatches(null, SECRET)).toBe(false);
    expect(bearerMatches(undefined, SECRET)).toBe(false);
    expect(bearerMatches("", SECRET)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches("Bearer undefined", undefined)).toBe(false);
    expect(bearerMatches("Bearer ", null)).toBe(false);
  });
});

describe("sameSecret", () => {
  it("matches only the exact value, and never an empty expected value", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abd", "abc")).toBe(false);
    expect(sameSecret("abcd", "abc")).toBe(false);
    expect(sameSecret("", "")).toBe(false);
    expect(sameSecret(null, "abc")).toBe(false);
  });
});
