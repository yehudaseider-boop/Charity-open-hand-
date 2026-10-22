/**
 * Which charities can take a donation right now. The money model is: straight to the
 * chosen charity's own account (a split payment). A real gateway must never take a
 * payment that would land with Givezy instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let row: Record<string, unknown> | null;
let gateway: { name: string; splitsPayments: boolean } | null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) };
    return { from: () => q };
  },
}));
vi.mock("@/lib/gateway", () => ({
  getGateway: () => {
    if (!gateway) throw new Error("misconfigured");
    return gateway;
  },
}));
const { platformConfig } = await import("@/config/platform");
const { loadDonatableCharity } = await import("@/lib/donations/charity");

const charity = (o: Record<string, unknown> = {}) => ({
  id: "c1", slug: "meals", name_en: "Meals", name_he: null, status: "approved", is_verified: true, is_s18a: true,
  mandate_signed_at: "2026-01-01T00:00:00Z", gateway: "paystack", gateway_subaccount_ref: "ACCT_1", ...o,
});
const bearer = (v: "charity" | "givezy" | null) => ((platformConfig.fees as { gatewayChargePaidBy: unknown }).gatewayChargePaidBy = v);

beforeEach(() => {
  row = charity();
  gateway = { name: "paystack", splitsPayments: true };
  bearer("charity");
});

describe("a real gateway (direct to the charity)", () => {
  it("takes payments for a connected charity once splitting is on and the fee payer is decided", async () => {
    const c = await loadDonatableCharity("meals");
    expect(c?.acceptingPayments).toBe(true);
    expect(c?.splitAccountRef).toBe("ACCT_1");
  });

  it("not while who pays the gateway charge is undecided", async () => {
    bearer(null);
    expect((await loadDonatableCharity("meals"))?.acceptingPayments).toBe(false);
  });

  it("not for a charity that has not been connected", async () => {
    row = charity({ gateway_subaccount_ref: null });
    const c = await loadDonatableCharity("meals");
    expect(c?.acceptingPayments).toBe(false);
    expect(c?.splitAccountRef).toBeNull();
  });

  it("not for a charity connected to some other gateway", async () => {
    row = charity({ gateway: "test", gateway_subaccount_ref: "test_acct_1" });
    expect((await loadDonatableCharity("meals"))?.acceptingPayments).toBe(false);
  });

  it("never when the gateway is not splitting, because the money would land with Givezy", async () => {
    gateway = { name: "paystack", splitsPayments: false };
    const c = await loadDonatableCharity("meals");
    expect(c?.acceptingPayments).toBe(false);
    expect(c?.splitAccountRef).toBeNull();
  });
});

describe("the test gateway", () => {
  it("takes payments with no account when it is not set to split (local development)", async () => {
    gateway = { name: "test", splitsPayments: false };
    row = charity({ gateway: null, gateway_subaccount_ref: null });
    bearer(null);
    expect((await loadDonatableCharity("meals"))?.acceptingPayments).toBe(true);
  });

  it("when set to split, needs the charity's test account like a real gateway", async () => {
    gateway = { name: "test", splitsPayments: true };
    row = charity({ gateway: null, gateway_subaccount_ref: null });
    expect((await loadDonatableCharity("meals"))?.acceptingPayments).toBe(false);
    row = charity({ gateway: "test", gateway_subaccount_ref: "test_acct_1" });
    expect((await loadDonatableCharity("meals"))?.acceptingPayments).toBe(true);
  });
});

describe("other cases", () => {
  it("a charity that is not approved is not shown", async () => {
    row = null;
    expect(await loadDonatableCharity("meals")).toBeNull();
  });

  it("a misconfigured gateway means 'not accepting', not an error", async () => {
    gateway = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await loadDonatableCharity("meals"))?.acceptingPayments).toBe(false);
  });
});
