/** Givy's suggested questions (22/11/2026): starting ones fit the charity's stage, follow-ups fit what was looked up. */
import { describe, expect, it } from "vitest";
import { followUps, nextMark, splitNext, startingSuggestions } from "@/lib/assistant/suggestions";

describe("starting questions", () => {
  it("lead with setting up before a charity is live, and with donations once it is", () => {
    expect(startingSuggestions(false)[0]).toBe("What's left to set up?");
    expect(startingSuggestions(true)[0]).toBe("How much came in this month?");
    expect(startingSuggestions(true)).not.toContain("What's left to set up?");
  });
});

describe("follow-up questions", () => {
  it("fit what was just looked up, at most three", () => {
    expect(followUps(["monthly_donations"], ["How are my monthly donations doing?"], true)).toEqual([
      "When are the next monthly collections?",
      "Are any monthly donations being retried?",
      "How much came in this month?",
    ]);
  });
  it("never offer a question already asked in this chat, whatever its case", () => {
    const next = followUps(["giving_totals"], ["how much came in this month?", "How does that compare to the last few months?"], true);
    expect(next).not.toContain("How much came in this month?");
    expect(next).not.toContain("How does that compare to the last few months?");
    expect(next).toHaveLength(3);
  });
  it("after a how-to answer with no lookups, fall back to the starting questions", () => {
    expect(followUps([], ["How do I add my logo?"], false)).toEqual(["What's left to set up?", "How do I add someone to my team?", "What happens once we're approved?"]);
  });
});

describe("the marker at the end of an answer", () => {
  it("is split off, keeping only our own lookup names", () => {
    expect(splitNext("R1 250 came in.\n[[next:giving_totals,made_up]]")).toEqual({ text: "R1 250 came in.", tools: ["giving_totals"] });
    expect(splitNext("Open [Team](dash:/team).\n[[next:]]")).toEqual({ text: "Open [Team](dash:/team).", tools: [] });
  });
  it("is hidden while it is still arriving in pieces, and an answer without one is left alone", () => {
    expect(splitNext("R1 250 came in.\n[[ne")).toEqual({ text: "R1 250 came in.", tools: null });
    expect(splitNext("R1 250 came in.\n[[next:giving_to")).toEqual({ text: "R1 250 came in.", tools: null });
    expect(splitNext("Plain answer.")).toEqual({ text: "Plain answer.", tools: null });
  });
  it("is written from names only, once each", () => {
    expect(nextMark(["giving_totals", "giving_totals", "bad name]]"])).toBe("\n[[next:giving_totals]]");
  });
});
