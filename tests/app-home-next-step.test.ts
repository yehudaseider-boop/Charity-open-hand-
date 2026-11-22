/** Home's top card asks for one thing (22/11/2026): a first cause, or giving again to the last charity given to. */
import { describe, expect, it } from "vitest";
import { homeNextStep } from "../apps/mobile/src/lib/home-next-step";

const g = (slug: string, name: string, cents: number, day: number) => ({ charitySlug: slug, charityName: name, cents, date: new Date(2026, 9, day) });

describe("Home's next step", () => {
  it("offers to give again to the charity given to last, with that gift's amount and day", () => {
    expect(homeNextStep([g("a", "Alpha", 10_000, 1), g("b", "Beta", 36_000, 20), g("c", "Gamma", 5_000, 3)])).toEqual({ kind: "again", slug: "b", charityName: "Beta", cents: 36_000, date: new Date(2026, 9, 20) });
  });
  it("with no gifts, asks for a first cause", () => {
    expect(homeNextStep([])).toEqual({ kind: "first" });
  });
  it("while giving hasn't loaded, makes no claim either way", () => {
    expect(homeNextStep([g("a", "Alpha", 10_000, 1)], false)).toEqual({ kind: "browse" });
  });
  it("passes over a charity that is no longer listed, for the latest one that still is (review 22/11/2026)", () => {
    expect(homeNextStep([g("a", "Alpha", 10_000, 1), g("", "Charity", 36_000, 20)])).toMatchObject({ kind: "again", slug: "a", charityName: "Alpha" });
  });
  it("when every charity given to is gone, points to a cause without calling it a first gift", () => {
    expect(homeNextStep([g("", "Charity", 36_000, 20)])).toEqual({ kind: "browse" });
  });
});
