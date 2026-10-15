import { describe, expect, it } from "vitest";
import { requestQuote, startPayment } from "../apps/mobile/src/lib/pay-api";

describe("app pay api", () => {
  it("posts to the server and returns its answer", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const post = async (url: string, body: unknown) => {
      seen.push({ url, body });
      return { status: 200, json: { ok: true, quote: { amountCents: 1800, contributionCents: 0, totalCents: 1800 } } };
    };
    const r = await requestQuote("https://x.test/", "kollel", 1800, 0, post);
    expect(r.ok && r.quote.totalCents).toBe(1800);
    expect(seen[0]).toEqual({ url: "https://x.test/api/app/quote", body: { slug: "kollel", giftCents: 1800, contributionCents: 0 } });
  });

  it("turns a network failure or a garbled reply into a plain message", async () => {
    const down = await startPayment("https://x.test", {} as never, async () => { throw new Error("offline"); });
    expect(!down.ok && down.message).toMatch(/connection/);
    const junk = await requestQuote("https://x.test", "a", 1, 0, async () => ({ status: 502, json: "<html>" }));
    expect(junk.ok).toBe(false);
  });
});

import { cleanRemembered, lastKind, quickAmounts } from "../apps/mobile/src/lib/pay-api";

describe("fewer taps", () => {
  const g = (slug: string, cents: number, day: number, kind = "maaser") => ({ charitySlug: slug, cents, date: new Date(2026, 9, day), kind, monthly: false });
  it("offers only the donor's own past amounts: this charity's last first, no repeats, at most three", () => {
    const gifts = [g("a", 18_000, 1), g("b", 36_000, 9), g("a", 50_000, 5), g("b", 18_000, 7), g("c", 10_000, 8)];
    expect(quickAmounts(gifts, "a")).toEqual([50_000, 18_000, 36_000]);
    expect(quickAmounts([], "a")).toEqual([]);
  });
  it("starts from what the last gift to this charity counted as", () => {
    expect(lastKind([g("a", 1, 1, "maaser"), g("a", 1, 5, "chomesh"), g("b", 1, 9, "tzedaka")], "a")).toBe("chomesh");
    expect(lastKind([], "a")).toBeNull();
  });
  it("remembers only name, email and phone, and only complete details", () => {
    expect(cleanRemembered({ first_name: "Dana", last_name: "Levi", email: "d@x.co", phone: "", id_number: "800101..." })).toEqual({ first_name: "Dana", last_name: "Levi", email: "d@x.co", phone: "" });
    expect(cleanRemembered({ first_name: "Dana" })).toBeNull();
    expect(cleanRemembered(null)).toBeNull();
  });
});
