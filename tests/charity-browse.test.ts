import { describe, expect, it } from "vitest";
import { causeHref, coverTone, emptyState, resultsLine } from "@/lib/charity/browse";

describe("the Find a charity page's words and links", () => {
  it("counts results in plain words, with the search and cause", () => {
    expect(resultsLine(1, "", null)).toBe("1 charity");
    expect(resultsLine(0, "", null)).toBe("0 charities");
    expect(resultsLine(6, "kitchen", null)).toBe("6 charities for “kitchen”");
    expect(resultsLine(2, "", "Education")).toBe("2 charities in Education");
    expect(resultsLine(3, "soup", "Food and welfare")).toBe("3 charities for “soup” in Food and welfare");
  });

  it("keeps what was typed when a cause is picked, and All clears only the cause", () => {
    expect(causeHref(null, "")).toBe("/charities");
    expect(causeHref("education", "")).toBe("/charities?category=education");
    expect(causeHref("education", "soup kitchen")).toBe("/charities?q=soup+kitchen&category=education");
    expect(causeHref(null, "soup")).toBe("/charities?q=soup");
  });

  it("gives an empty search a way out, never two buttons to the same place", () => {
    const search = emptyState("zzz", null);
    expect(search.title).toBe("No charities match that yet");
    expect(search.body).toBe("Nothing for “zzz”. Try another word or a different cause.");
    expect(search.actions).toEqual([{ label: "Clear the search", href: "/charities" }]);

    const both = emptyState("zzz", { slug: "animals", name: "Animals" });
    expect(both.body).toContain("“zzz” in Animals");
    expect(both.actions).toEqual([
      { label: "Clear the search", href: "/charities?category=animals" },
      { label: "See all charities", href: "/charities" },
    ]);

    expect(emptyState("", { slug: "animals", name: "Animals" }).actions).toEqual([{ label: "See all charities", href: "/charities" }]);
  });

  it("says the list is simply empty when nothing was searched", () => {
    const none = emptyState("", null);
    expect(none.title).toBe("No charities yet");
    expect(none.actions).toEqual([]);
  });

  it("takes turns with the soft colours behind charities with no cover photo", () => {
    expect([0, 1, 2, 3].map(coverTone)).toEqual(["bg-honey-soft", "bg-peach", "bg-brand-soft", "bg-honey-soft"]);
    expect(coverTone(-1)).toBe("bg-brand-soft");
  });
});
