/** "Needs you this week" on the charity overview (CRM step 17, 10/11/2026). */
import { describe, expect, it } from "vitest";
import { donorsToThank, listInWords, thisWeek, WEEK_SOURCE_NAMES, type ThisWeekFacts } from "@/lib/charity/this-week";

const base = "/charity-admin/c1";
const empty: ThisWeekFacts = {
  base,
  todaySa: "2026-11-10",
  toThank: { count: 0, onlyDonorId: null },
  monthly: { retrying: 0, pausedRecently: 0 },
  stopped: { count: 0, centsPerMonth: 0 },
  s18aMissing: 0,
  lapsed: { count: 0, periodText: "12 months" },
  followUps: [],
  endingSoon: [],
  refunded: { count: 0, cents: 0 },
  chargedBack: 0,
};

describe("thisWeek", () => {
  it("leaves out every line with nothing to do, so the card can say nothing needs you", () => {
    expect(thisWeek(empty)).toEqual({ items: [], unavailable: [] });
  });

  it("shows each kind of line with one button to where it is done", () => {
    const w = thisWeek({
      ...empty,
      toThank: { count: 3, onlyDonorId: null },
      monthly: { retrying: 2, pausedRecently: 1 },
      stopped: { count: 1, centsPerMonth: 25_000 },
      s18aMissing: 4,
      lapsed: { count: 1, periodText: "12 months" },
      refunded: { count: 2, cents: 12_550 },
      chargedBack: 1,
    });
    expect(w.unavailable).toEqual([]);
    expect(w.items.map((i) => [i.key, i.href])).toEqual([
      ["thank", `${base}/donors?group=new`],
      ["retry", `${base}/monthly?show=running`],
      ["paused", `${base}/monthly?show=paused`],
      ["stopped", `${base}/monthly/stopped?period=30-days`],
      ["s18a", `${base}/donors?s18a=details_missing`],
      ["lapsed", `${base}/donors?group=lapsed`],
      ["refund", `${base}/donations?status=refunded`],
      ["cb", `${base}/donations?status=charged_back`],
    ]);
    const text = w.items.map((i) => i.text);
    expect(text).toContain("3 new donors this week, not yet thanked personally");
    expect(text).toContain("1 monthly donor stopped in the last 30 days (R250 a month)");
    expect(text).toContain("4 donors asked for an s18A receipt but haven't added the details SARS needs");
    expect(text).toContain("2 donations refunded (R125.50)");
    for (const t of text) {
      expect(t).not.toMatch(/[!—]/);
    }
  });

  it("sends a single donor to thank straight to their page", () => {
    const [item] = thisWeek({ ...empty, toThank: { count: 1, onlyDonorId: "d9" } }).items;
    expect(item).toMatchObject({ key: "thank", href: `${base}/donors/d9`, text: "1 new donor this week, not yet thanked personally", link: "Say thank you" });
  });

  it("uses the singular for one donor missing s18A details", () => {
    expect(thisWeek({ ...empty, s18aMissing: 1 }).items[0].text).toBe("1 donor asked for an s18A receipt but hasn't added the details SARS needs");
  });

  it("names the parts it couldn't check and still shows the rest", () => {
    const w = thisWeek({ ...empty, toThank: null, stopped: null, s18aMissing: null, monthly: { retrying: 1, pausedRecently: 0 } });
    expect(w.items.map((i) => i.key)).toEqual(["retry"]);
    expect(w.unavailable).toEqual([WEEK_SOURCE_NAMES.toThank, WEEK_SOURCE_NAMES.stopped, WEEK_SOURCE_NAMES.s18aMissing]);
  });

  it("never says nothing needs you when everything failed", () => {
    const w = thisWeek({ ...empty, toThank: null, monthly: null, stopped: null, s18aMissing: null });
    expect(w.items).toEqual([]);
    expect(w.unavailable).toHaveLength(4);
  });

  it("names the first five follow-ups and counts the rest, saying when a late one was due", () => {
    const followUps = Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, donor_id: `d${i}`, donor_name: `Donor ${i}`, what: "call", due_on: i === 0 ? "2026-11-03" : "2026-11-10" }));
    const items = thisWeek({ ...empty, followUps }).items;
    expect(items).toHaveLength(6);
    expect(items[0].text).toBe("Follow up with Donor 0: call (was due 03/11/2026)");
    expect(items[1].text).toBe("Follow up with Donor 1: call");
    expect(items[5]).toMatchObject({ key: "f-more", text: "2 more follow-ups due" });
  });

  it("shows a campaign about to end with its progress", () => {
    const items = thisWeek({ ...empty, endingSoon: [{ id: "k1", title: "Winter soup", endsAt: "2026-11-15T21:59:59Z", raisedCents: 50_000, targetCents: 100_000 }] }).items;
    expect(items[0].text).toBe('"Winter soup" ends on 15/11/2026, at 50% of its goal');
  });

  it("handles very large counts and amounts", () => {
    const [item] = thisWeek({ ...empty, stopped: { count: 12_000, centsPerMonth: 987_654_321 } }).items;
    expect(item.text).toBe("12000 monthly donors stopped in the last 30 days (R9 876 543.21 a month)");
  });
});

describe("listInWords", () => {
  it("joins names for one sentence", () => {
    expect(listInWords([])).toBe("");
    expect(listInWords(["a"])).toBe("a");
    expect(listInWords(["a", "b"])).toBe("a and b");
    expect(listInWords(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("donorsToThank", () => {
  const now = new Date("2026-11-10T08:00:00Z");
  const day = 86_400_000;
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * day).toISOString();
  const facts = { canEmail: (e: string) => !e.endsWith("@erased.invalid"), lastThankedAt: new Map<string, string>(), optedOut: new Set<string>() };

  it("keeps first gifts from the last 7 days only", () => {
    const donors = [
      { donor_id: "new", first_paid_at: at(2), email: "a@x.co" },
      { donor_id: "edge", first_paid_at: at(7), email: "b@x.co" },
      { donor_id: "old", first_paid_at: at(8), email: "c@x.co" },
    ];
    expect(donorsToThank(donors, now, facts).map((d) => d.donor_id)).toEqual(["new", "edge"]);
  });

  it("leaves out erased donors, those who asked not to be thanked, and those thanked since their first gift", () => {
    const donors = [
      { donor_id: "erased", first_paid_at: at(1), email: "x@erased.invalid" },
      { donor_id: "stopped", first_paid_at: at(1), email: "Stop@X.co " },
      { donor_id: "thanked", first_paid_at: at(3), email: "t@x.co" },
      { donor_id: "thanked-before", first_paid_at: at(3), email: "u@x.co" },
    ];
    const out = donorsToThank(donors, now, {
      ...facts,
      optedOut: new Set(["stop@x.co"]),
      lastThankedAt: new Map([["thanked", at(1)], ["thanked-before", at(30)]]),
    });
    expect(out.map((d) => d.donor_id)).toEqual(["thanked-before"]);
  });

  it("ignores a first gift dated in the future", () => {
    expect(donorsToThank([{ donor_id: "f", first_paid_at: at(-1), email: "f@x.co" }], now, facts)).toEqual([]);
  });
});
