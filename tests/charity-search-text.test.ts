/**
 * Charity search ignores capitals and accents both ways (21/11/2026), on the website (its pattern) and in the app
 * (matchesSearch, shared through @shared/charity/search-text), and folds the way the database's unaccent does.
 */
import { describe, expect, it, vi } from "vitest";
import { matchesSearch, plainSearchText, searchWords } from "@/lib/charity/search-text";

vi.mock("server-only", () => ({}));
const { cleanQuery, searchPattern } = await import("@/app/charities/view");

describe("plainSearchText", () => {
  it("drops accents and capitals", () => {
    expect(plainSearchText("Café Kids")).toBe("cafe kids");
    expect(plainSearchText("CAFÉ")).toBe("cafe");
    expect(plainSearchText("Crèche Zürich Ñandú")).toBe("creche zurich nandu");
    // Typed with a separate accent mark (some keyboards) as well as the single letter.
    expect(plainSearchText("Café")).toBe("cafe");
  });

  it("spells out the letters unaccent spells out", () => {
    expect(plainSearchText("Straße Ærø Œuvre Łódź")).toBe("strasse aero oeuvre lodz");
  });

  it("keeps other scripts, digits and signs as they are", () => {
    expect(plainSearchText("שלום 50%_off")).toBe("שלום 50%_off");
  });
});

describe("searchWords", () => {
  it("splits on anything that isn't a letter, digit or apostrophe", () => {
    expect(searchWords("Save-a-Life")).toEqual(["save", "a", "life"]);
    expect(searchWords("St Mary's Café")).toEqual(["st", "mary's", "cafe"]);
    expect(searchWords("%%% __")).toEqual([]);
  });
});

describe("the website's pattern", () => {
  it("is folded, so it matches the database's search column", () => {
    expect(searchPattern(cleanQuery("CAFÉ"))).toBe("%cafe%");
    expect(searchPattern(cleanQuery("Café Kids"))).toBe("%cafe%kids%");
    expect(searchPattern(cleanQuery("Save-a-Life"))).toBe("%save%a%life%");
  });
});

describe("matchesSearch (the app)", () => {
  const cafe = ["Café Kids Trust", "Children", "Soweto"];
  it("finds a name with or without its accent", () => {
    for (const typed of ["Cafe", "cafe", "CAFÉ", "café kids"]) expect(matchesSearch(typed, cafe)).toBe(true);
    expect(matchesSearch("café", ["Cafe Bongani"])).toBe(true);
  });

  it("finds words with signs between them, in order", () => {
    expect(matchesSearch("save a life", ["Save-a-Life"])).toBe(true);
    expect(matchesSearch("boys girls", ["Boys & Girls Club"])).toBe(true);
    expect(matchesSearch("girls boys", ["Boys & Girls Club"])).toBe(false);
  });

  it("searches the fields together, like the website", () => {
    expect(matchesSearch("cafe soweto", cafe)).toBe(true);
    expect(matchesSearch("kitchen", cafe)).toBe(false);
  });

  it("finds nothing for signs only, and copes with empty fields", () => {
    expect(matchesSearch("%", cafe)).toBe(false);
    expect(matchesSearch("_", cafe)).toBe(false);
    expect(matchesSearch("", cafe)).toBe(false);
    expect(matchesSearch("cafe", [null, undefined, ""])).toBe(false);
  });
});
