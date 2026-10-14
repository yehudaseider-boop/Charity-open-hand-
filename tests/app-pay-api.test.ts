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
