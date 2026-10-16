/**
 * The app's checkout endpoint, through to startDonation, with the database and gateway faked:
 * a monthly gift from the app must start a monthly record, save the card, record the
 * authorisation and send the donor back to the app.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Op = { table: string; op: string; row?: Record<string, unknown> };
const ops: Op[] = [];
const checkouts: Record<string, unknown>[] = [];
let campaignRow: Record<string, unknown> | null = null;

function builder(table: string) {
  const result = { data: [] as unknown, error: null };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "limit", "lt", "gte"]) b[m] = () => b;
  b.insert = (row: Record<string, unknown>) => {
    ops.push({ table, op: "insert", row });
    return b;
  };
  b.update = (row: Record<string, unknown>) => {
    ops.push({ table, op: "update", row });
    return b;
  };
  b.single = async () => ({ data: { id: "donor-1" }, error: null });
  b.maybeSingle = async () => ({ data: table === "campaigns" ? campaignRow : null, error: null });
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
const limits: { bucket: string; keys: string[]; limit: number }[] = [];
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async (bucket: string, keys: string[], limit: number) => (limits.push({ bucket, keys, limit }), false) }));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => {} }));
let signedIn: { userId: string; email: string } | null = null;
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => signedIn }));
vi.mock("@/lib/donations/saved-id", () => ({ savedIdNumber: async () => "8001015009087", savedIdLast4: async () => "9087" }));
vi.mock("@/lib/donations/confirmation-access", () => ({ issueConfirmationToken: async () => "tok" }));
vi.mock("@/lib/donations/charity", () => ({
  loadDonatableCharity: async () => ({ id: "c1", name_en: "Meals", acceptingPayments: true, receiptsAvailable: true, splitAccountRef: "ACCT_1" }),
}));
vi.mock("@/lib/gateway", () => ({
  GatewayError: class extends Error {},
  getGateway: () => ({
    name: "test",
    createCheckout: async (req: Record<string, unknown>) => {
      checkouts.push(req);
      return { redirectUrl: "https://pay.test/x" };
    },
  }),
}));

const { POST } = await import("@/app/api/app/checkout/route");

const details = {
  donor_type: "individual",
  email: "a@example.com",
  first_name: "Dana",
  last_name: "Levi",
  giving_kind: "maaser",
  age_confirmed: true,
  popia_consent: true,
};
const call = (body: unknown) =>
  POST(new Request("https://site.test/api/app/checkout", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never);
const gift = { slug: "meals", giftCents: 10_000, contributionCents: 1_000, shownTotalCents: 11_000 };

beforeEach(() => {
  ops.length = 0;
  checkouts.length = 0;
  limits.length = 0;
  signedIn = null;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  campaignRow = null;
  process.env.APP_GIVING = "yes";
  process.env.SITE_URL = "https://site.test";
});

describe("app checkout endpoint", () => {
  it("is closed unless the server switch is on", async () => {
    delete process.env.APP_GIVING;
    expect((await call({ ...gift, details })).status).toBe(404);
  });

  it("starts a monthly gift: monthly record, saved card, authorisation consent, return to the app", async () => {
    const res = await call({ ...gift, details: { ...details, monthly: true, monthly_authorised: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirectUrl: "https://pay.test/x", reference: expect.any(String), token: "tok" });

    const monthly = ops.find((o) => o.table === "recurring_donations" && o.op === "insert");
    expect(monthly?.row).toMatchObject({ amount_cents: 10_000, contribution_cents: 1_000, status: "pending" });
    const consents = ops.filter((o) => o.table === "consents").map((o) => o.row?.kind);
    expect(consents).toEqual(["donation", "monthly_authorisation"]);
    expect(checkouts[0]).toMatchObject({ saveCard: true, totalCents: 11_000 });
    expect(String(checkouts[0].returnUrl)).toMatch(/&from=app$/);
  });

  it("refuses a monthly gift without the authorisation, and records nothing", async () => {
    const res = await call({ ...gift, details: { ...details, monthly: true } });
    expect(res.status).toBe(422);
    expect((await res.json()).fieldErrors.monthly_authorised).toBeTruthy();
    expect(ops).toHaveLength(0);
    expect(checkouts).toHaveLength(0);
  });

  it("a once-off gift starts no monthly record and does not save the card", async () => {
    const res = await call({ ...gift, details });
    expect(res.status).toBe(200);
    expect(ops.some((o) => o.table === "recurring_donations")).toBe(false);
    expect(checkouts[0]).toMatchObject({ saveCard: false });
  });

  it("counts only tries that would reach the payment page: 5 per email, 30 per address", async () => {
    await call({ ...gift, giftCents: 100, shownTotalCents: 1_100, details });
    expect(limits).toHaveLength(0);
    await call({ ...gift, details });
    expect(limits.map((l) => [l.keys[0].split(":")[0], l.limit])).toEqual([["email", 5], ["ip", 30]]);
  });

  it("fills in the saved ID number for the signed-in donor giving with their own email", async () => {
    signedIn = { userId: "u1", email: "A@example.com" };
    const res = await call({ ...gift, useSavedId: true, details: { ...details, wants_18a: true } });
    expect(res.status).toBe(200);
    const saved = ops.find((o) => o.table === "donation_checkout_details" && o.op === "insert")?.row;
    expect(saved?.id_number_last4).toBe("9087");
  });

  it("never uses a saved ID number without a signed-in donor, or with another email", async () => {
    const guest = await call({ ...gift, useSavedId: true, details: { ...details, wants_18a: true } });
    expect(guest.status).toBe(422);
    signedIn = { userId: "u1", email: "someone.else@example.com" };
    const other = await call({ ...gift, useSavedId: true, details: { ...details, wants_18a: true } });
    expect((await other.json()).fieldErrors.id_number).toMatch(/goes with your account's email/);
    expect(checkouts).toHaveLength(0);
  });

  it("stops when the total changed, and returns the new figures", async () => {
    const res = await call({ ...gift, shownTotalCents: 10_000, details });
    expect(res.status).toBe(409);
    expect((await res.json()).quote.totalCents).toBe(11_000);
    expect(checkouts).toHaveLength(0);
  });

  const CAMPAIGN = "6f1c2a52-3b7e-4d0a-9c41-2f6e8d5b7a10";

  it("labels a gift with the charity's active campaign", async () => {
    campaignRow = { id: CAMPAIGN, ends_at: null };
    const res = await call({ ...gift, campaignId: CAMPAIGN, details });
    expect(res.status).toBe(200);
    expect(ops.find((o) => o.table === "donations" && o.op === "insert")?.row).toMatchObject({ campaign_id: CAMPAIGN });
  });

  it("refuses an ended or unknown campaign, and a monthly campaign gift, before recording anything", async () => {
    campaignRow = { id: CAMPAIGN, ends_at: "2020-01-01T00:00:00Z" };
    expect((await call({ ...gift, campaignId: CAMPAIGN, details })).status).toBe(409);
    campaignRow = null;
    expect((await call({ ...gift, campaignId: CAMPAIGN, details })).status).toBe(409);
    campaignRow = { id: CAMPAIGN, ends_at: null };
    const monthly = await call({ ...gift, campaignId: CAMPAIGN, details: { ...details, monthly: true, monthly_authorised: true } });
    expect((await monthly.json()).message).toMatch(/once-off/);
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(0);
    expect(checkouts).toHaveLength(0);
  });
});
