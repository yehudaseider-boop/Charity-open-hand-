/**
 * A gift that fails before the payment page opens is closed at once (13/11/2026): nothing can have been charged, so
 * the gift is marked failed and a monthly record cancelled, never left "pending" (a monthly one was never closed at
 * all). The app gets a plain message, not a bare error page. A saved-card attempt is left as it is, since the app asks
 * about it again under the same id. Through the app's checkout endpoint, with the database and gateway faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Op = { table: string; op: string; row?: Record<string, unknown>; filters: [string, unknown][] };
const ops: Op[] = [];
const checkouts: Record<string, unknown>[] = [];
/** The table whose insert fails, standing for a database error after the gift is saved. */
let failInsertOn: string | null = null;
let gatewayDown = false;

function builder(table: string) {
  let current: Op | null = null;
  const b: Record<string, unknown> = {};
  for (const m of ["select", "is", "limit", "lt", "gte", "in", "like"]) b[m] = () => b;
  b.eq = (col: string, v: unknown) => (current?.filters.push([col, v]), b);
  b.insert = (row: Record<string, unknown>) => ((current = { table, op: "insert", row, filters: [] }), ops.push(current), b);
  b.update = (row: Record<string, unknown>) => ((current = { table, op: "update", row, filters: [] }), ops.push(current), b);
  b.delete = () => b;
  b.single = async () => ({ data: { id: "donor-1" }, error: null });
  b.maybeSingle = async () => ({ data: null, error: null });
  b.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve(current?.op === "insert" && table === failInsertOn ? { data: null, error: new Error(`${table} insert failed`) } : { data: [], error: null }).then(ok);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("@/lib/donations/giving-guard", () => ({ checkGivingAllowed: async () => null, rememberGiftStart: async () => {} }));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => {} }));
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => null }));
vi.mock("@/lib/donations/confirmation-access", () => ({ issueConfirmationToken: async () => "tok", reissueConfirmationToken: async () => "tok2" }));
vi.mock("@/lib/donations/charity", () => ({
  loadDonatableCharity: async () => ({ id: "c1", name_en: "Meals", acceptingPayments: true, receiptsAvailable: true, splitAccountRef: "ACCT_1" }),
}));
vi.mock("@/lib/gateway", () => {
  class GatewayError extends Error {}
  return {
    GatewayError,
    isGatewayRefusal: () => false,
    getGateway: () => ({
      name: "test",
      createCheckout: async (req: Record<string, unknown>) => {
        if (gatewayDown) throw new GatewayError("provider down");
        checkouts.push(req);
        return { redirectUrl: "https://pay.test/x" };
      },
    }),
  };
});

const { POST } = await import("@/app/api/app/checkout/route");

const details = { donor_type: "individual", email: "a@example.com", first_name: "Dana", last_name: "Dube", age_confirmed: true, popia_consent: true };
const gift = { slug: "meals", giftCents: 10_000, contributionCents: 0, shownTotalCents: 10_000 };
const call = (body: unknown) =>
  POST(new Request("https://site.test/api/app/checkout", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never);
const updates = (table: string) => ops.filter((o) => o.table === table && o.op === "update");

beforeEach(() => {
  ops.length = 0;
  checkouts.length = 0;
  failInsertOn = null;
  gatewayDown = false;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.APP_GIVING = "yes";
  process.env.SITE_URL = "https://site.test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a gift that fails before the payment page", () => {
  it("is closed as failed at once, never opens the payment page, and the app gets plain words", async () => {
    failInsertOn = "consents";
    const res = await call({ ...gift, details });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, message: expect.stringMatching(/nothing was charged/) });
    expect(checkouts).toHaveLength(0);
    const [closed] = updates("donations");
    expect(closed.row).toMatchObject({ status: "failed" });
    // Only while still pending: a gift that somehow moved on is never touched.
    expect(closed.filters).toContainEqual(["status", "pending"]);
  });

  it("a monthly gift's record is cancelled too, so it never stays pending for good", async () => {
    failInsertOn = "donation_checkout_details";
    const res = await call({ ...gift, details: { ...details, monthly: true, monthly_authorised: true } });
    expect(res.status).toBe(503);
    expect(updates("donations")[0].row).toMatchObject({ status: "failed" });
    expect(updates("recurring_donations").map((u) => u.row)).toContainEqual(expect.objectContaining({ status: "cancelled", ended_reason: "the first payment could not be started" }));
  });

  it("the monthly record is cancelled even when the gift itself couldn't be saved", async () => {
    failInsertOn = "donations";
    const res = await call({ ...gift, details: { ...details, monthly: true, monthly_authorised: true } });
    expect(res.status).toBe(503);
    expect(updates("recurring_donations").map((u) => u.row)).toContainEqual(expect.objectContaining({ status: "cancelled" }));
  });

  it("the payment provider being down still closes the gift and says so, as before", async () => {
    gatewayDown = true;
    const res = await call({ ...gift, details });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/couldn't reach the payment provider, so nothing was charged/);
    expect(updates("donations")[0].row).toMatchObject({ status: "failed" });
  });

  it("a gift that starts normally is left pending for the payment page", async () => {
    const res = await call({ ...gift, details });
    expect(res.status).toBe(200);
    expect(checkouts).toHaveLength(1);
    expect(updates("donations")).toHaveLength(0);
  });
});
