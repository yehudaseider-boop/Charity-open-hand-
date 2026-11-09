/** News from your charities on Home: the charities a donor gave to, their newest updates, in plain words. */
import { describe, expect, it } from "vitest";
import type { Gift, Recurring } from "../apps/mobile/src/data/giving";
import type { CharityUpdate } from "../apps/mobile/src/data/sample";
import { charitiesGivenTo, newsFeed, newsKey, optOutIds, postedWhen, relationLine, NEWS_LIMIT, NEWS_MAX_CHARITIES } from "../apps/mobile/src/lib/charity-news";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const today = d(2026, 11, 8);
const gift = (id: string, slug: string, date: Date): Gift => ({ id, date, charitySlug: slug, charityName: slug === "meals" ? "Meals Fund" : "Animal Rescue", cents: 10_000, monthly: false, with18a: false, label: null });
const monthly = (slug: string, status: Recurring["status"]): Recurring => ({ id: `r-${slug}`, charitySlug: slug, charityName: "Patient Care", cents: 18_000, nextDate: d(2026, 12, 1), status });
const upd = (id: string, date: Date, body = "Parcels went out this week."): CharityUpdate => ({ id, date, body, photoUrl: null });

describe("the charities a donor gave to", () => {
  it("lists each once, most recent gift first, and marks a monthly donation", () => {
    const list = charitiesGivenTo([gift("a", "meals", d(2026, 3, 1)), gift("b", "animals", d(2026, 10, 2)), gift("c", "meals", d(2026, 9, 20))], [monthly("meals", "active")]);
    expect(list.map((c) => c.slug)).toEqual(["animals", "meals"]);
    expect(list[1]).toMatchObject({ monthly: true, lastGift: d(2026, 9, 20) });
  });

  it("counts an active or paused monthly donation with no paid gift yet, but not a cancelled or failed one", () => {
    const list = charitiesGivenTo([], [monthly("care", "paused"), monthly("gone", "cancelled"), monthly("declined", "failed")]);
    expect(list.map((c) => c.slug)).toEqual(["care"]);
  });
});

describe("plain words on each card", () => {
  it("says when it was posted: today, yesterday, or the date", () => {
    expect(postedWhen(new Date("2026-11-08T07:00:00Z"), today)).toBe("Today");
    expect(postedWhen(new Date("2026-11-07T20:00:00Z"), today)).toBe("Yesterday");
    expect(postedWhen(new Date("2026-11-02T09:00:00Z"), today)).toBe("02/11/2026");
  });

  it("says how the donor is connected, with the year only when it isn't this year", () => {
    expect(relationLine({ slug: "a", name: "A", monthly: true, lastGift: d(2026, 1, 1) }, today)).toBe("You give every month");
    expect(relationLine({ slug: "a", name: "A", monthly: false, lastGift: d(2026, 10, 2) }, today)).toBe("You gave in October");
    expect(relationLine({ slug: "a", name: "A", monthly: false, lastGift: d(2025, 11, 3) }, today)).toBe("You gave in November 2025");
  });
});

describe("the news on Home", () => {
  const gaveTo = charitiesGivenTo([gift("a", "meals", d(2026, 10, 2)), gift("b", "animals", d(2026, 9, 2))], []);

  it("shows the newest updates first, at most three, and leaves out old or empty ones", () => {
    const updates = new Map([
      ["meals", [upd("m1", d(2026, 11, 6)), upd("m2", d(2026, 10, 20)), upd("m-old", d(2026, 8, 1)), upd("m-empty", d(2026, 11, 7), "   ")]],
      ["animals", [upd("a1", d(2026, 11, 4)), upd("a2", d(2026, 10, 1))]],
      ["someone-else", [upd("x1", d(2026, 11, 8))]],
    ]);
    const feed = newsFeed(gaveTo, updates, today);
    expect(feed.map((n) => n.id)).toEqual(["m1", "a1", "m2"]);
    expect(feed).toHaveLength(NEWS_LIMIT);
    expect(feed[0]).toMatchObject({ charityName: "Meals Fund", relation: "You gave in October", when: "06/11/2026" });
  });

  it("is empty when there is no news, so Home shows no section at all", () => {
    expect(newsFeed(gaveTo, new Map(), today)).toEqual([]);
    expect(newsFeed([], new Map([["meals", [upd("m1", d(2026, 11, 6))]]]), today)).toEqual([]);
  });
});

describe("which charities' news is asked for", () => {
  it("asks about the 20 most recent charities at most, so the query never gets too long", () => {
    const slugs = Array.from({ length: 45 }, (_, i) => `charity-${i}`);
    const key = newsKey(slugs);
    expect(key.split(",")).toHaveLength(NEWS_MAX_CHARITIES);
    expect(NEWS_MAX_CHARITIES).toBe(20);
    expect(key.split(",")[0]).toBe("charity-0");
    expect(newsKey(["a", "b"])).toBe("a,b");
    expect(newsKey([])).toBe("");
  });
});

describe("No news or appeals from this charity", () => {
  it("reads the opted-out charities as a plain list or as rows", () => {
    expect(optOutIds(["c1", "c2"])).toEqual(new Set(["c1", "c2"]));
    expect(optOutIds([{ my_news_opt_outs: "c1" }, { my_news_opt_outs: "c2" }])).toEqual(new Set(["c1", "c2"]));
    expect(optOutIds([])).toEqual(new Set());
    expect(optOutIds(null)).toEqual(new Set());
  });

  it("treats anything odd as not known, so no news shows rather than news they said no to", () => {
    expect(optOutIds({ my_news_opt_outs: "c1" })).toBeNull();
    expect(optOutIds([{ other: "c1" }])).toBeNull();
    expect(optOutIds([1, 2])).toBeNull();
    expect(optOutIds("c1")).toBeNull();
  });
});
