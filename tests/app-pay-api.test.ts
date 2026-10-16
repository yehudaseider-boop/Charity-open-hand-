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

import { cleanRemembered, lastLabel, quickAmounts } from "../apps/mobile/src/lib/pay-api";

describe("fewer taps", () => {
  const g = (slug: string, cents: number, day: number, label: string | null = null) => ({ charitySlug: slug, cents, date: new Date(2026, 9, day), label, monthly: false });
  it("offers only the donor's own past amounts: this charity's last first, no repeats, at most three", () => {
    const gifts = [g("a", 18_000, 1), g("b", 36_000, 9), g("a", 50_000, 5), g("b", 18_000, 7), g("c", 10_000, 8)];
    expect(quickAmounts(gifts, "a")).toEqual([50_000, 18_000, 36_000]);
    expect(quickAmounts([], "a")).toEqual([]);
  });
  it("starts from the label of the last gift to this charity", () => {
    expect(lastLabel([g("a", 1, 1, "Family"), g("a", 1, 5, "Work giving"), g("b", 1, 9, "Other")], "a")).toBe("Work giving");
    expect(lastLabel([], "a")).toBeNull();
  });
  it("remembers only name, email and phone, and only complete details", () => {
    expect(cleanRemembered({ first_name: "Dana", last_name: "Levi", email: "d@x.co", phone: "", id_number: "800101..." })).toEqual({ first_name: "Dana", last_name: "Levi", email: "d@x.co", phone: "" });
    expect(cleanRemembered({ first_name: "Dana" })).toBeNull();
    expect(cleanRemembered(null)).toBeNull();
  });
});

import { afterPaymentMessage, centsToInput, checkReady, paymentStatus } from "../apps/mobile/src/lib/pay-api";

describe("before and after the payment page", () => {
  it("a 404 from the server means give on the website instead", async () => {
    expect(await checkReady("https://x.test", "a", undefined, async () => ({ status: 404, json: { ok: false } }))).toEqual({ ok: false, closed: true });
  });
  it("reads whether the charity can take the gift, the campaign and the minimums", async () => {
    const seen: unknown[] = [];
    const r = await checkReady("https://x.test", "a", "c1", async (url, body) => (seen.push([url, body]), { status: 200, json: { ok: true, accepting: true, receiptsAvailable: false, campaignOpen: true, minGiftCents: 3_000, minContributionCents: 1_000 } }));
    expect(r).toEqual({ ok: true, accepting: true, receiptsAvailable: false, campaignOpen: true, minGiftCents: 3_000, minContributionCents: 1_000, savedIdLast4: null });
    expect(seen[0]).toEqual(["https://x.test/api/app/ready", { slug: "a", campaignId: "c1" }]);
  });
  it("offline is a plain message, not the website hand-off", async () => {
    const r = await checkReady("https://x.test", "a", undefined, async () => { throw new Error("offline"); });
    expect(r.ok === false && !r.closed && r.message).toMatch(/connection/);
  });
  it("an unknown or unreachable payment status reads as still pending, never as paid", async () => {
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 200, json: { ok: true, outcome: "paid" } }))).toBe("paid");
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 200, json: { ok: true, outcome: "weird" } }))).toBe("pending");
    expect(await paymentStatus("https://x.test", "r", "t", async () => { throw new Error("offline"); })).toBe("pending");
  });
  it("tells the donor plainly whether anything was charged", () => {
    expect(afterPaymentMessage("failed")).toMatch(/nothing was charged/);
    expect(afterPaymentMessage("review")).toMatch(/don't pay again/);
    expect(afterPaymentMessage("pending")).toMatch(/wait for your confirmation email before giving again/);
    for (const o of ["failed", "review", "pending", "not_found"] as const) expect(afterPaymentMessage(o)).not.toMatch(/!|—/);
  });
  it("puts a past amount in the box as the donor would type it", () => {
    expect(centsToInput(18_000)).toBe("180");
    expect(centsToInput(18_050)).toBe("180.50");
    expect(centsToInput(125_005)).toBe("1250.05");
  });
});

describe("saved ID number in the app", () => {
  it("sends the sign-in token to our server only, and reads back four digits at most", async () => {
    const seen: (string | null | undefined)[] = [];
    const r = await checkReady("https://x.test", "a", undefined, async (_u, _b, token) => (seen.push(token), { status: 200, json: { ok: true, accepting: true, receiptsAvailable: true, campaignOpen: false, minGiftCents: 3_000, minContributionCents: 1_000, savedIdLast4: "9087" } }), "tok");
    expect(seen).toEqual(["tok"]);
    expect(r.ok && r.savedIdLast4).toBe("9087");
    const odd = await checkReady("https://x.test", "a", undefined, async () => ({ status: 200, json: { ok: true, accepting: true, receiptsAvailable: true, campaignOpen: false, minGiftCents: 3_000, minContributionCents: 1_000, savedIdLast4: "8001015009087" } }));
    expect(odd.ok && odd.savedIdLast4).toBeNull();
  });
});
