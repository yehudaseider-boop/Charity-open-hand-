/**
 * The charities search (review 12/11/2026): words are found with anything between them, so names written with a
 * hyphen or an "&" still match, and only letters, digits, spaces and apostrophes ever reach the database filter.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { cleanQuery, searchPattern } = await import("@/app/charities/view");

/** What Postgres ILIKE does with % (anything) and no other special signs, case-insensitively. */
const ilike = (text: string, pattern: string) =>
  new RegExp(`^${pattern.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "is").test(text);
const finds = (typed: string, name: string) => ilike(name, searchPattern(cleanQuery(typed)));

describe("the charities search", () => {
  it("finds names with signs between the words", () => {
    expect(finds("Save-a-Life", "Save-a-Life Trust")).toBe(true);
    expect(finds("save a life", "Save-a-Life Trust")).toBe(true);
    expect(finds("Boys & Girls", "Boys & Girls Club")).toBe(true);
    expect(finds("boys girls", "Boys & Girls Club")).toBe(true);
    expect(finds("St Mary's", "St Mary's Children's Home")).toBe(true);
  });

  it("still needs every word, in order", () => {
    expect(finds("girls boys", "Boys & Girls Club")).toBe(false);
    expect(finds("kitchen", "Boys & Girls Club")).toBe(false);
  });

  it("sends only safe characters", () => {
    expect(searchPattern(cleanQuery('a%b_c"d,e(f)'))).toBe("%a%b%c%d%e%f%");
    expect(cleanQuery("%%%")).toBe("");
  });
});
