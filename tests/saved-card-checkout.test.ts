/**
 * Saved cards for once-off gifts, through the app's checkout endpoint with the database and gateway
 * faked: closed unless switched on, signed-in donors only, their own email only, never with a monthly
 * gift, and a charge on the saved card that is only ever treated as a first indication.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Op = { table: string; op: string; row?: Record<string, unknown> };
const ops: Op[] = [];
const checkouts: Record<string, unknown>[] = [];
const charges: Record<string, unknown>[] = [];
let chargeResult: () => Promise<{ status: string }> = async () => ({ status: "pending" });
let refusal = false;
let stored: { code: string; gateway: string } | null = { code: "AUTH_SECRET", gateway: "test" };
const requests: { donationId: string; userId: string }[] = [];
/** A donation already recorded under the attempt id the app sends. */
let prior: Record<string, unknown> | null = null;

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "limit", "lt", "gte"]) b[m] = () => b;
  b.insert = (row: Record<string, unknown>) => (ops.push({ table, op: "insert", row }), b);
  b.update = (row: Record<string, unknown>) => (ops.push({ table, op: "update", row }), b);
  b.single = async () => ({ data: { id: "donor-1" }, error: null });
  b.maybeSingle = async () => ({ data: table === "donations" ? prior : null, error: null });
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => {} }));
let signedIn: { userId: string; email: string } | null = null;
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => signedIn }));
vi.mock("@/lib/donations/saved-id", () => ({ savedIdNumber: async () => "8001015009087", savedIdLast4: async () => "9087" }));
vi.mock("@/lib/donations/confirmation-access", () => ({ issueConfirmationToken: async () => "tok", reissueConfirmationToken: async () => "tok2" }));
vi.mock("@/lib/donations/saved-card", () => ({
  loadSavedCardToken: async () => stored,
  requestCardSave: async (donationId: string, userId: string) => void requests.push({ donationId, userId }),
}));
vi.mock("@/lib/donations/charity", () => ({
  loadDonatableCharity: async () => ({ id: "c1", name_en: "Meals", acceptingPayments: true, receiptsAvailable: true, splitAccountRef: "ACCT_1" }),
}));
vi.mock("@/lib/gateway", () => ({
  GatewayError: class extends Error {},
  isGatewayRefusal: () => refusal,
  getGateway: () => ({
    name: "test",
    createCheckout: async (req: Record<string, unknown>) => (checkouts.push(req), { redirectUrl: "https://pay.test/x" }),
    chargeAuthorization: async (req: Record<string, unknown>) => (charges.push(req), chargeResult()),
  }),
}));

const { POST } = await import("@/app/api/app/checkout/route");

const details = { donor_type: "individual", email: "a@example.com", first_name: "Dana", last_name: "Levi", age_confirmed: true, popia_consent: true };
const gift = { slug: "meals", giftCents: 10_000, contributionCents: 0, shownTotalCents: 10_000 };
const call = (body: unknown) =>
  POST(new Request("https://site.test/api/app/checkout", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never);

beforeEach(() => {
  ops.length = 0;
  checkouts.length = 0;
  charges.length = 0;
  requests.length = 0;
  chargeResult = async () => ({ status: "pending" });
  refusal = false;
  prior = null;
  stored = { code: "AUTH_SECRET", gateway: "test" };
  signedIn = { userId: "u1", email: "A@example.com" };
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.APP_GIVING = "yes";
  process.env.SAVED_CARDS = "yes";
  process.env.SITE_URL = "https://site.test";
});

describe("saved cards: switch and sign-in", () => {
  it("is closed unless SAVED_CARDS=yes, and records nothing", async () => {
    delete process.env.SAVED_CARDS;
    const res = await call({ ...gift, saveCard: true, details });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/isn't switched on/);
    expect(ops).toHaveLength(0);
    expect(charges).toHaveLength(0);
  });

  it("needs a signed-in donor", async () => {
    signedIn = null;
    expect((await call({ ...gift, saveCard: true, details })).status).toBe(401);
    expect((await call({ ...gift, useSavedCard: true, details })).status).toBe(401);
    expect(ops).toHaveLength(0);
  });

  it("only works with the account's own email, for saving and for paying", async () => {
    for (const flag of ["saveCard", "useSavedCard"]) {
      const res = await call({ ...gift, [flag]: true, details: { ...details, email: "someone.else@example.com" } });
      expect(res.status).toBe(422);
      expect((await res.json()).fieldErrors.email).toBeTruthy();
    }
    expect(charges).toHaveLength(0);
    expect(ops).toHaveLength(0);
  });

  it("is never combined with a monthly gift, or with both choices at once", async () => {
    const monthly = await call({ ...gift, saveCard: true, details: { ...details, monthly: true, monthly_authorised: true } });
    expect(monthly.status).toBe(409);
    const both = await call({ ...gift, saveCard: true, useSavedCard: true, details });
    expect(both.status).toBe(409);
    expect(ops).toHaveLength(0);
    expect(charges).toHaveLength(0);
  });
});

describe("saving a card on a once-off gift", () => {
  it("goes to the payment page for the card, records the consent and asks to keep the card", async () => {
    const res = await call({ ...gift, saveCard: true, details });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, redirectUrl: "https://pay.test/x" });
    expect(checkouts[0]).toMatchObject({ saveCard: true });
    expect(ops.filter((o) => o.table === "consents").map((o) => o.row?.kind)).toEqual(["donation", "saved_card"]);
    expect(requests).toEqual([{ donationId: expect.any(String), userId: "u1" }]);
    expect(ops.some((o) => o.table === "recurring_donations")).toBe(false);
  });

  it("a gift without the tick keeps nothing", async () => {
    await call({ ...gift, details });
    expect(checkouts[0]).toMatchObject({ saveCard: false });
    expect(requests).toHaveLength(0);
    expect(ops.filter((o) => o.table === "consents").map((o) => o.row?.kind)).toEqual(["donation"]);
  });
});

describe("paying with the saved card", () => {
  it("charges the card for exactly the total shown, with no payment page", async () => {
    const res = await call({ ...gift, contributionCents: 1_000, shownTotalCents: 11_000, useSavedCard: true, details });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, charged: true, token: "tok" });
    expect(body.redirectUrl).toBeUndefined();
    expect(checkouts).toHaveLength(0);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ authorizationCode: "AUTH_SECRET", totalCents: 11_000, monthly: false, reference: body.reference, lines: { charityCents: 10_000, contributionCents: 1_000 } });
    expect(ops.filter((o) => o.table === "consents").map((o) => o.row?.kind)).toEqual(["donation"]);
  });

  it("never reveals the stored token to the app", async () => {
    const res = await call({ ...gift, useSavedCard: true, details });
    expect(JSON.stringify(await res.json())).not.toContain("AUTH_SECRET");
  });

  it("stops before recording anything when there is no saved card, or it came from another gateway", async () => {
    stored = null;
    expect((await call({ ...gift, useSavedCard: true, details })).status).toBe(409);
    stored = { code: "AUTH_SECRET", gateway: "other" };
    expect((await call({ ...gift, useSavedCard: true, details })).status).toBe(409);
    expect(ops).toHaveLength(0);
    expect(charges).toHaveLength(0);
  });

  it("a card the provider declines ends the gift as failed, and says to use another card", async () => {
    chargeResult = async () => ({ status: "failed" });
    const res = await call({ ...gift, useSavedCard: true, details });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/declined/);
    expect(ops.some((o) => o.table === "donations" && o.op === "update" && o.row?.status === "failed")).toBe(true);
  });

  it("a refusal from the provider also ends the gift as failed", async () => {
    refusal = true;
    chargeResult = async () => {
      throw new Error("refused");
    };
    const res = await call({ ...gift, useSavedCard: true, details });
    expect(res.status).toBe(409);
    expect(ops.some((o) => o.table === "donations" && o.op === "update" && o.row?.status === "failed")).toBe(true);
  });

  it("a timeout or outage leaves the gift pending, because the charge may have gone through", async () => {
    chargeResult = async () => {
      throw new Error("timeout");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({ ...gift, useSavedCard: true, details });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, charged: true });
    expect(ops.some((o) => o.table === "donations" && o.op === "update" && o.row?.status === "failed")).toBe(false);
  });
});

describe("asking twice about the same saved-card gift", () => {
  const attemptId = "6f1c2c1e-0d2a-4c4b-9a59-2b8d6d7c1a11";
  it("uses the app's attempt id as the donation's reference", async () => {
    const res = await call({ ...gift, useSavedCard: true, attemptId, details });
    expect(await res.json()).toMatchObject({ ok: true, charged: true, reference: attemptId });
    expect(charges[0]).toMatchObject({ reference: attemptId });
  });

  it("never charges again: the first answer comes back", async () => {
    prior = { status: "pending", charity_id: "c1", total_charged_cents: 10_000, donation_checkout_details: { email: "a@example.com" } };
    const res = await call({ ...gift, useSavedCard: true, attemptId, details });
    expect(await res.json()).toMatchObject({ ok: true, charged: true, reference: attemptId, token: "tok2" });
    expect(charges).toHaveLength(0);
    expect(ops.filter((o) => o.op === "insert")).toHaveLength(0);
  });

  it("a declined first try stays declined", async () => {
    prior = { status: "failed", charity_id: "c1", total_charged_cents: 10_000, donation_checkout_details: { email: "a@example.com" } };
    const res = await call({ ...gift, useSavedCard: true, attemptId, details });
    expect(await res.json()).toMatchObject({ ok: false, savedCardDeclined: true });
    expect(charges).toHaveLength(0);
  });

  it("refuses an id that belongs to another gift (different amount, email or charity)", async () => {
    for (const p of [
      { total_charged_cents: 25_000, charity_id: "c1", email: "a@example.com" },
      { total_charged_cents: 10_000, charity_id: "c2", email: "a@example.com" },
      { total_charged_cents: 10_000, charity_id: "c1", email: "b@example.com" },
    ]) {
      prior = { status: "paid", charity_id: p.charity_id, total_charged_cents: p.total_charged_cents, donation_checkout_details: { email: p.email } };
      const res = await call({ ...gift, useSavedCard: true, attemptId, details });
      expect((await res.json()).ok).toBe(false);
    }
    expect(charges).toHaveLength(0);
  });
});
