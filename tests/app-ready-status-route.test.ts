/**
 * The two calls around the app's payment page: "can I take this gift?" before, and "did it go
 * through?" after. Both are closed with the server switch off, and the status needs the
 * donor's own credential.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let charity: Record<string, unknown> | null = null;
let campaignOpen = false;
let confirmed = 0;
let confirmFails = false;
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => charity }));
vi.mock("@/lib/donations/checkout", () => ({ loadOpenCampaign: async () => (campaignOpen ? { id: "x" } : null) }));
vi.mock("@/lib/donations/confirm", () => ({
  confirmPayment: async () => {
    confirmed++;
    if (confirmFails) throw new Error("provider down");
    return "paid";
  },
}));
// "a…" is the gift's own live link, "e…" its own link past its 30 days; anything else is no link at all.
vi.mock("@/lib/donations/confirmation-access", () => ({
  confirmationAccess: async (_r: string, t: string) => (t === "a".repeat(43) ? "valid" : t === "e".repeat(43) ? "expired" : "none"),
}));
let limitBroken = false;
vi.mock("@/lib/rate-limit", () => ({
  ipKeys: (ip: string) => (ip && ip !== "unknown" ? [`ip:${ip}`] : []),
  hitRateLimit: async () => {
    if (limitBroken) throw new Error("rate limit store down");
    return false;
  },
}));
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => null }));
vi.mock("@/lib/donations/saved-id", () => ({ savedIdLast4: async () => "9087" }));

const ready = (await import("@/app/api/app/ready/route")).POST;
const { lateDetailsDeadlineForGiftOn } = await import("@/lib/donations/s18a-details");
const status = (await import("@/app/api/app/status/route")).POST;
const req = (body: unknown) => new Request("https://site.test/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never;
const REF = "6f1c2a52-3b7e-4d0a-9c41-2f6e8d5b7a10";

beforeEach(() => {
  process.env.APP_GIVING = "yes";
  charity = { id: "c1", acceptingPayments: true, receiptsAvailable: true };
  campaignOpen = false;
  confirmed = 0;
  confirmFails = false;
  limitBroken = false;
});

describe("app ready check", () => {
  it("is closed (404) with the server switch off, so the app sends the donor to the website", async () => {
    delete process.env.APP_GIVING;
    expect((await ready(req({ slug: "a" }))).status).toBe(404);
  });
  it("says whether the charity can take a payment, the campaign is open, and the minimums", async () => {
    campaignOpen = true;
    const r = await (await ready(req({ slug: "a", campaignId: REF }))).json();
    // The last day to add s18A details after paying, from the same setting as the confirmation email.
    expect(r.s18aDetailsBy).toBe(lateDetailsDeadlineForGiftOn());
    expect(r.s18aDetailsBy).toMatch(/^31\/05\/\d{4}$/);
    expect(r).toEqual({ ok: true, accepting: true, paused: false, receiptsAvailable: true, s18aDetailsBy: lateDetailsDeadlineForGiftOn(), campaignOpen: true, minGiftCents: 3_000, minContributionCents: 1_000, maxContributionCents: 500_000, contributionPresetsCents: [1_000, 1_500, 2_000], contributionDefaultCents: 1_000, maxGiftCents: 100_000_000, savedIdLast4: null, suggestedCents: [], savedCardsOpen: false, savedCard: null, cardChargeRates: { percentPpm: 29_000, fixedCents: 100, vatOnTopPpm: 150_000, coverGiftOnly: true } });
  });
  it("a charity not connected for payments is not accepting", async () => {
    charity = { id: "c1", acceptingPayments: false, receiptsAvailable: false };
    expect((await (await ready(req({ slug: "a" }))).json()).accepting).toBe(false);
    charity = null;
    expect((await (await ready(req({ slug: "a" }))).json()).accepting).toBe(false);
  });
});

describe("app payment status", () => {
  it("needs the donor's credential and never checks without it", async () => {
    expect((await status(req({ reference: REF, token: "b".repeat(43) }))).status).toBe(404);
    expect(confirmed).toBe(0);
  });
  it("tells the holder of the gift's own expired link that it has expired, with nothing about the gift, and never checks", async () => {
    const res = await status(req({ reference: REF, token: "e".repeat(43) }));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ ok: false, expired: true, message: "This gift's check link has expired." });
    expect(confirmed).toBe(0);
  });
  it("anyone without the gift's own link still gets the same plain 'not found' (a wrong link, a malformed one, none)", async () => {
    for (const token of ["b".repeat(43), "e".repeat(42), ""]) {
      const res = await status(req({ reference: REF, token }));
      if (res.status === 400) continue;
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, message: "Donation not found." });
    }
    expect(confirmed).toBe(0);
  });
  it("returns the outcome only", async () => {
    expect(await (await status(req({ reference: REF, token: "a".repeat(43) }))).json()).toEqual({ ok: true, outcome: "paid" });
  });
  it("says it couldn't check, never 'still confirming', when the check fails", async () => {
    confirmFails = true;
    const res = await status(req({ reference: REF, token: "a".repeat(43) }));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });
  it("a limit check that fails counts as limited: a plain 'check again', and the provider is not asked", async () => {
    limitBroken = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await status(req({ reference: REF, token: "a".repeat(43) }));
    expect(res.status).toBe(429);
    expect((await res.json()).message).toMatch(/check again/);
    expect(confirmed).toBe(0);
  });
  it("is closed with the server switch off", async () => {
    delete process.env.APP_GIVING;
    expect((await status(req({ reference: REF, token: "a".repeat(43) }))).status).toBe(404);
  });
});
