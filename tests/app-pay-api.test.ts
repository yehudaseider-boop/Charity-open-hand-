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

import { cardLabel, cleanRemembered, cleanSavedCard, fetchSavedCard, lastLabel, quickAmounts, removeSavedCard } from "../apps/mobile/src/lib/pay-api";

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
    expect(r).toEqual({ ok: true, accepting: true, receiptsAvailable: false, campaignOpen: true, minGiftCents: 3_000, minContributionCents: 1_000, maxGiftCents: null, savedIdLast4: null, suggestedCents: [], savedCardsOpen: false, savedCard: null });
    expect(seen[0]).toEqual(["https://x.test/api/app/ready", { slug: "a", campaignId: "c1" }]);
  });
  it("offline is a plain message, not the website hand-off", async () => {
    const r = await checkReady("https://x.test", "a", undefined, async () => { throw new Error("offline"); });
    expect(r.ok === false && !r.closed && r.message).toMatch(/connection/);
  });
  it("an unknown or unreachable payment status reads as still pending, never as paid", async () => {
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 200, json: { ok: true, outcome: "paid" } }))).toBe("paid");
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 200, json: { ok: true, outcome: "weird" } }))).toBe("pending");
    expect(await paymentStatus("https://x.test", "r", "t", async () => ({ status: 200, json: { ok: true, outcome: "reversed" } }))).toBe("reversed");
    expect(afterPaymentMessage("reversed")).toMatch(/refunded, so nothing is owed/);
    expect(await paymentStatus("https://x.test", "r", "t", async () => { throw new Error("offline"); })).toBe("pending");
  });
  it("tells the donor plainly whether anything was charged", () => {
    expect(afterPaymentMessage("failed")).toMatch(/nothing was charged/);
    expect(afterPaymentMessage("review")).toMatch(/don't pay again/);
    expect(afterPaymentMessage("pending")).toMatch(/please don.t pay again: tap Check again/);
    expect(afterPaymentMessage("pending", false, new Date("2026-10-18T12:05:00Z"))).toMatch(/Last checked at 14:05\./);
    expect(afterPaymentMessage("not_found")).toMatch(/nothing was charged/);
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

describe("saved card in the app", () => {
  it("shows only brand, last four digits and expiry, and drops anything else the server sends", () => {
    expect(cleanSavedCard({ brand: "visa", last4: "4242", expires: "12/2030", code: "AUTH_SECRET" })).toEqual({ brand: "visa", last4: "4242", expires: "12/2030" });
    expect(cleanSavedCard({ brand: "visa", last4: "42" })).toBeNull();
    expect(cleanSavedCard(null)).toBeNull();
    expect(cleanSavedCard({ last4: "4242", expires: "soon" })).toEqual({ brand: null, last4: "4242", expires: null });
  });

  it("names the card for the donor", () => {
    expect(cardLabel({ brand: "visa", last4: "4242", expires: null })).toBe("Visa ending 4242");
    expect(cardLabel({ brand: null, last4: "4242", expires: null })).toBe("Card ending 4242");
  });

  it("reads the switch and the card from the ready check", async () => {
    const reply = { ok: true, accepting: true, minGiftCents: 3000, minContributionCents: 1000, savedCardsOpen: true, savedCard: { brand: "mastercard", last4: "5100", expires: "01/2029" } };
    const r = await checkReady("https://x.test", "a", undefined, async () => ({ status: 200, json: reply }), "tok");
    expect(r.ok && r.savedCardsOpen).toBe(true);
    expect(r.ok && r.savedCard?.last4).toBe("5100");
    const off = await checkReady("https://x.test", "a", undefined, async () => ({ status: 200, json: { ...reply, savedCardsOpen: undefined, savedCard: undefined } }));
    expect(off.ok && off.savedCardsOpen).toBe(false);
    expect(off.ok && off.savedCard).toBeNull();
  });

  it("loads and removes the saved card with the donor's token", async () => {
    const seen: string[] = [];
    const send = async (method: string, url: string, token: string) => {
      seen.push(`${method} ${url} ${token}`);
      return { status: 200, json: method === "GET" ? { ok: true, card: { brand: "visa", last4: "4242", expires: "12/2030" } } : { ok: true } };
    };
    const got = await fetchSavedCard("https://x.test/", "tok", send);
    expect(got.ok && got.card?.last4).toBe("4242");
    expect((await removeSavedCard("https://x.test", "tok", send)).ok).toBe(true);
    expect(seen).toEqual(["GET https://x.test/api/app/saved-card tok", "DELETE https://x.test/api/app/saved-card tok"]);
  });

  it("says plainly when saved cards are off, or the network is down", async () => {
    const closed = await fetchSavedCard("https://x.test", "tok", async () => ({ status: 404, json: null }));
    expect(!closed.ok && closed.closed).toBe(true);
    const down = await fetchSavedCard("https://x.test", "tok", async () => { throw new Error("offline"); });
    expect(!down.ok && down.message).toMatch(/connection/);
    const failed = await removeSavedCard("https://x.test", "tok", async () => ({ status: 500, json: null }));
    expect(!failed.ok && failed.message).toMatch(/couldn't remove/);
  });
});
