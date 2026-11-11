/** The long public pages leave out questions about cost and fees until the fees are settled (11/11/2026). */
import { describe, expect, it } from "vitest";
import { charityFaqs, donorFaqs, withoutCostQuestions } from "@/lib/seo/faq";

describe("questions without cost or fees", () => {
  it("drops any question whose question or answer mentions cost, fees or free", () => {
    const kept = withoutCostQuestions([
      { q: "What does it cost?", a: "Nothing much." },
      { q: "How do receipts work?", a: "Listing is free." },
      { q: "Is there a fee?", a: "See below." },
      { q: "Can I give every month?", a: "Yes." },
    ]);
    expect(kept.map((f) => f.q)).toEqual(["Can I give every month?"]);
  });

  it("matches whole words only, so 'freedom' or 'coffee' stay", () => {
    expect(withoutCostQuestions([{ q: "Freedom Day?", a: "A coffee morning." }])).toHaveLength(1);
  });

  it("keeps the real donor and charity questions that aren't about money", () => {
    const donor = withoutCostQuestions(donorFaqs).map((f) => f.q);
    expect(donor.some((q) => /cost/i.test(q))).toBe(false);
    expect(donor.length).toBe(donorFaqs.length - 1);
    expect(withoutCostQuestions(charityFaqs).map((f) => f.q)).toEqual([charityFaqs[0].q]);
  });
});
