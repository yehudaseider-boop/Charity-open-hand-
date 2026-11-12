/**
 * Saved ID planting (security review, 12/11/2026). A guest gift given with someone else's email and a made-up ID
 * number must never become that person's "Use my ID ending 1234" or saved address, and must never fill in the
 * details on their donor record. Only a gift started while signed in with that same email counts as theirs.
 * Through the app's checkout endpoint, with the database and gateway faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Op = { table: string; op: string; row?: Record<string, unknown> };
const ops: Op[] = [];
/** The donor record found for the gift's email, if any. */
let existingDonor: Record<string, unknown> | null = null;

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "limit", "lt", "gte", "in", "not", "order"]) b[m] = () => b;
  b.insert = (row: Record<string, unknown>) => (ops.push({ table, op: "insert", row }), b);
  b.update = (row: Record<string, unknown>) => (ops.push({ table, op: "update", row }), b);
  b.upsert = (row: Record<string, unknown>) => (ops.push({ table, op: "upsert", row }), b);
  b.single = async () => ({ data: { id: "donor-new" }, error: null });
  b.maybeSingle = async () => ({ data: null, error: null });
  b.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: table === "donors" && existingDonor ? [existingDonor] : [], error: null }).then(ok);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false, rateLimitReached: async () => false, hashedKey: (k: string, v: string) => `${k}:${v}`, ipKeys: (ip: string) => [`ip:${ip}`] }));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => {} }));
let signedIn: { userId: string; email: string } | null = null;
vi.mock("@/lib/app-auth", () => ({ appAccount: async () => signedIn }));
vi.mock("@/lib/donations/saved-id", () => ({ savedIdNumber: async () => "8001015009087", savedAddress: async () => null, savedIdLast4: async () => "9087" }));
vi.mock("@/lib/donations/confirmation-access", () => ({ issueConfirmationToken: async () => "tok", reissueConfirmationToken: async () => "tok2" }));
vi.mock("@/lib/donations/saved-card", () => ({ loadSavedCardToken: async () => null, requestCardSave: async () => {} }));
vi.mock("@/lib/donations/charity", () => ({
  loadDonatableCharity: async () => ({ id: "c1", name_en: "Meals", acceptingPayments: true, receiptsAvailable: true, splitAccountRef: "ACCT_1" }),
}));
vi.mock("@/lib/gateway", () => ({
  GatewayError: class extends Error {},
  isGatewayRefusal: () => false,
  getGateway: () => ({ name: "test", createCheckout: async () => ({ redirectUrl: "https://pay.test/x" }) }),
}));

const { POST } = await import("@/app/api/app/checkout/route");

const details = {
  donor_type: "individual", email: "owner@example.com", first_name: "Dana", last_name: "Dube", age_confirmed: true, popia_consent: true,
  wants_18a: true, id_number: "8001015009087", address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001",
};
const gift = { slug: "meals", giftCents: 10_000, contributionCents: 0, shownTotalCents: 10_000 };
const call = (body: unknown) =>
  POST(new Request("https://site.test/api/app/checkout", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never);
const rows = (table: string, op: string) => ops.filter((o) => o.table === table && o.op === op).map((o) => o.row!);

beforeEach(() => {
  ops.length = 0;
  existingDonor = null;
  signedIn = null;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.APP_GIVING = "yes";
  process.env.SITE_URL = "https://site.test";
});

describe("which gifts can become someone's saved ID", () => {
  it("a guest gift is not marked as started by any account", async () => {
    expect((await call({ ...gift, details })).status).toBe(200);
    const [row] = rows("donation_checkout_details", "insert");
    expect(row).not.toHaveProperty("started_by_user");
    expect(row.id_number_last4).toBe("9087");
  });

  it("a gift given while signed in with the same email is marked as that account's", async () => {
    signedIn = { userId: "user-1", email: "Owner@Example.com" };
    expect((await call({ ...gift, details })).status).toBe(200);
    expect(rows("donation_checkout_details", "insert")[0]).toMatchObject({ started_by_user: "user-1" });
  });

  it("a gift given while signed in with another email is not that account's", async () => {
    signedIn = { userId: "user-2", email: "someone-else@example.com" };
    expect((await call({ ...gift, details })).status).toBe(200);
    expect(rows("donation_checkout_details", "insert")[0]).not.toHaveProperty("started_by_user");
  });
});

describe("a donor record that belongs to an account", () => {
  const owned = { id: "donor-1", user_id: "user-1", registration_number: null, first_name: null, last_name: null, phone: null, id_number_last4: null, address_line1: null, city: null, postal_code: null };

  it("is not filled in by a guest gift with that email", async () => {
    existingDonor = { ...owned };
    expect((await call({ ...gift, details })).status).toBe(200);
    expect(rows("donors", "update")).toEqual([]);
    expect(rows("donors", "insert")).toEqual([]);
    expect(rows("donations", "insert")[0]).toMatchObject({ donor_id: "donor-1" });
  });

  it("is not filled in by someone signed in to another account", async () => {
    existingDonor = { ...owned };
    signedIn = { userId: "user-2", email: "owner@example.com" };
    await call({ ...gift, details });
    expect(rows("donors", "update")).toEqual([]);
  });

  it("is filled in (blanks only) by its own account", async () => {
    existingDonor = { ...owned, first_name: "Kept" };
    signedIn = { userId: "user-1", email: "owner@example.com" };
    await call({ ...gift, details });
    const [update] = rows("donors", "update");
    expect(update).toMatchObject({ last_name: "Dube", id_number_last4: "9087", address_line1: "5 Rissik Street" });
    expect(update).not.toHaveProperty("first_name");
  });

  it("a record no account has claimed yet still has its blanks filled, as before", async () => {
    existingDonor = { ...owned, user_id: null };
    await call({ ...gift, details });
    expect(rows("donors", "update")[0]).toMatchObject({ last_name: "Dube" });
  });
});
