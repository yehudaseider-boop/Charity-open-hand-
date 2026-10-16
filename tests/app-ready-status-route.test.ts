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
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => charity }));
vi.mock("@/lib/donations/checkout", () => ({ loadOpenCampaign: async () => (campaignOpen ? { id: "x" } : null) }));
vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: async () => (confirmed++, "paid") }));
vi.mock("@/lib/donations/confirmation-access", () => ({ confirmationTokenMatches: async (_r: string, t: string) => t === "a".repeat(43) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => null }));
vi.mock("@/lib/donations/saved-id", () => ({ savedIdLast4: async () => "9087" }));

const ready = (await import("@/app/api/app/ready/route")).POST;
const status = (await import("@/app/api/app/status/route")).POST;
const req = (body: unknown) => new Request("https://site.test/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never;
const REF = "6f1c2a52-3b7e-4d0a-9c41-2f6e8d5b7a10";

beforeEach(() => {
  process.env.APP_GIVING = "yes";
  charity = { id: "c1", acceptingPayments: true, receiptsAvailable: true };
  campaignOpen = false;
  confirmed = 0;
});

describe("app ready check", () => {
  it("is closed (404) with the server switch off, so the app sends the donor to the website", async () => {
    delete process.env.APP_GIVING;
    expect((await ready(req({ slug: "a" }))).status).toBe(404);
  });
  it("says whether the charity can take a payment, the campaign is open, and the minimums", async () => {
    campaignOpen = true;
    const r = await (await ready(req({ slug: "a", campaignId: REF }))).json();
    expect(r).toEqual({ ok: true, accepting: true, receiptsAvailable: true, campaignOpen: true, minGiftCents: 3_000, minContributionCents: 1_000, savedIdLast4: null, savedCardsOpen: false, savedCard: null });
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
  it("returns the outcome only", async () => {
    expect(await (await status(req({ reference: REF, token: "a".repeat(43) }))).json()).toEqual({ ok: true, outcome: "paid" });
  });
  it("is closed with the server switch off", async () => {
    delete process.env.APP_GIVING;
    expect((await status(req({ reference: REF, token: "a".repeat(43) }))).status).toBe(404);
  });
});
