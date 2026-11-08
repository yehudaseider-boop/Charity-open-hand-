/**
 * "Add my details after paying" at checkout (04/11/2026), through the app's checkout endpoint with the database and
 * gateway faked: the gift is recorded as wanting an s18A receipt, with none of its particulars kept from the form
 * (so the receipt waits for the donor's own entry), and with the same agreements recorded as any gift.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Op = { table: string; op: string; row?: Record<string, unknown> };
const ops: Op[] = [];
const checkouts: Record<string, unknown>[] = [];
const charges: Record<string, unknown>[] = [];
const chargeResult: () => Promise<{ status: string }> = async () => ({ status: "pending" });
const refusal = false;
const stored: { code: string; gateway: string } | null = { code: "AUTH_SECRET", gateway: "test" };
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
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false, ipKeys: (ip: string) => [`ip:${ip}`] }));
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


const details = { donor_type: "individual", email: "a@example.com", first_name: "Dana", last_name: "Dube", age_confirmed: true, popia_consent: true };
const gift = { slug: "meals", giftCents: 10_000, contributionCents: 0, shownTotalCents: 10_000 };
const call = (body: unknown) =>
  POST(new Request("https://site.test/api/app/checkout", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as never);
const inserted = (table: string) => ops.filter((o) => o.table === table && o.op === "insert").map((o) => o.row!);

beforeEach(() => {
  ops.length = 0;
  checkouts.length = 0;
  prior = null;
  signedIn = null;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.APP_GIVING = "yes";
  process.env.SITE_URL = "https://site.test";
});

describe("s18A details after paying", () => {
  it("starts the gift without the ID number and address, wanting an s18A receipt, and keeps none sent along", async () => {
    const res = await call({ ...gift, details: { ...details, wants_18a: true, s18a_when: "later", id_number: "8001015009087", address_line1: "5 Rissik Street" } });
    expect(res.status).toBe(200);
    const [donation] = inserted("donations");
    expect(donation).toMatchObject({ wants_18a: true });
    const [row] = inserted("donation_checkout_details");
    for (const k of ["receipt_identity", "id_number_encrypted", "id_number_last4", "address_line1", "city", "postal_code"]) expect(row).not.toHaveProperty(k);
    expect(checkouts).toHaveLength(1);
  });
  it("records the same agreements as any gift: the age and sharing consent times and the consent row", async () => {
    await call({ ...gift, details: { ...details, wants_18a: true, s18a_when: "later" } });
    const [donation] = inserted("donations");
    expect(donation.popia_consent_at).toEqual(expect.any(String));
    expect(donation.age_confirmed_at).toEqual(expect.any(String));
    expect(inserted("consents")).toEqual([expect.objectContaining({ kind: "donation" })]);
  });
  it("now: the details are still needed before paying, and kept as before when given", async () => {
    const refused = await call({ ...gift, details: { ...details, wants_18a: true, s18a_when: "now" } });
    expect(refused.status).toBe(422);
    expect(Object.keys((await refused.json()).fieldErrors)).toEqual(expect.arrayContaining(["id_number", "address_line1"]));
    ops.length = 0;
    const res = await call({ ...gift, details: { ...details, wants_18a: true, id_number: "8001015009087", address_line1: "5 Rissik Street", city: "Johannesburg", postal_code: "2001" } });
    expect(res.status).toBe(200);
    const [row] = inserted("donation_checkout_details");
    expect(row).toMatchObject({ id_number_last4: "9087", address_line1: "5 Rissik Street" });
    expect(row.receipt_identity).toEqual(expect.any(String));
  });
});
