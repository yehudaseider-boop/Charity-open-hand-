/**
 * Where the money landed (fresh review, 25/11/2026): a split payment is only marked paid when the payment provider says
 * it went to the charity's own account. Otherwise it is held for a person once, never paid unchecked, never emailed.
 * The database, the provider and the emails are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; status: string; gateway: string; total_charged_cents: number; recurring_id: string | null; created_at: string; gateway_ref: string; charity_id: string };
let donation: Row;
let charity: { id: string; gateway: string; gateway_subaccount_ref: string | null };
let audits: { action: string; entityId?: string | null; details?: unknown }[];
const events: string[] = [];
const verify = vi.fn();
const gateway = { name: "paystack", splitsPayments: true, reportsSplit: true as boolean | undefined, verifyTransaction: verify };

vi.mock("@/lib/audit", () => ({
  logAudit: async (e: { action: string; entityId?: string | null; details?: unknown }) => {
    audits.push(e);
  },
}));
vi.mock("@/lib/gateway", () => ({ gatewayByName: () => gateway, getGateway: () => gateway }));
vi.mock("@/lib/donations/notify", () => ({
  oweDonorConfirmation: async () => void events.push("owed"),
  notifyDonationPaid: async () => void events.push("emailed"),
}));
vi.mock("@/lib/donations/giving-guard", () => ({ recordDecline: async () => {} }));
vi.mock("@/lib/donations/saved-card", () => ({ cardSaveWaitingFor: async () => false, finishCardSave: async () => "none" }));
vi.mock("@/lib/donations/new-card", () => ({ newCardWaitingFor: async () => false, finishNewCard: async () => ({ finishedHere: false }) }));
vi.mock("@/lib/donations/recurring", () => ({
  FIRST_PAYMENT_FAILED: "the first payment failed",
  activateMonthlyDonation: async () => "none",
  cancelMonthlyBeforeStart: async () => {},
  monthlyHandledElsewhere: async () => false,
  monthlyWaitingFor: async () => false,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const matches = (r: Record<string, unknown>) => filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v));
      const rows = (): Record<string, unknown>[] =>
        table === "donations" ? [donation] : table === "charities" ? [charity] : table === "audit_log" ? audits.map((a) => ({ id: "a", action: a.action, entity_id: a.entityId })) : [];
      let patch: Partial<Row> | null = null;
      const q = {
        select: () => q,
        update: (p: Partial<Row>) => ((patch = p), q),
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        in: (c: string, v: unknown[]) => (filters.push([c, v]), q),
        limit: async () => ({ data: rows().filter(matches), error: null }),
        maybeSingle: async () => ({ data: rows().filter(matches)[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (patch && table === "donations" && matches(donation as unknown as Record<string, unknown>)) {
            Object.assign(donation, patch);
            resolve({ data: [{ id: donation.id }], error: null });
          } else resolve({ data: patch ? [] : rows().filter(matches), error: null });
        },
      };
      return q;
    },
  }),
}));

const { confirmPayment } = await import("@/lib/donations/confirm");
const { splitAccounts } = await import("@/lib/gateway/paystack");
const REF = "11111111-1111-1111-1111-111111111111";
const paidTx = (settledTo: string[]) => ({ reference: REF, status: "success", amountCents: 20_000, currency: "ZAR", gatewayTransactionId: "1", settledTo });

beforeEach(() => {
  donation = { id: REF, status: "pending", gateway: "paystack", total_charged_cents: 20_000, recurring_id: null, created_at: new Date().toISOString(), gateway_ref: REF, charity_id: "c1" };
  charity = { id: "c1", gateway: "paystack", gateway_subaccount_ref: "ACCT_charity" };
  audits = [];
  events.length = 0;
  verify.mockReset();
  gateway.splitsPayments = true;
  gateway.reportsSplit = true;
});

describe("a split payment is only paid when it reached the charity's own account", () => {
  it("the provider names the charity's account: paid and emailed", async () => {
    verify.mockResolvedValue(paidTx(["ACCT_charity"]));
    expect(await confirmPayment(REF)).toBe("paid");
    expect(donation.status).toBe("paid");
    expect(events).toContain("emailed");
  });

  it("the provider names no account (the split was ignored): held for a person, not paid, not emailed", async () => {
    verify.mockResolvedValue(paidTx([]));
    expect(await confirmPayment(REF)).toBe("review");
    expect(donation.status).toBe("pending");
    expect(events).toEqual([]);
    expect(audits).toEqual([expect.objectContaining({ action: "donation.split_mismatch", entityId: REF, details: { expected: "ACCT_charity", reported: [] } })]);
  });

  it("the provider names another account: held", async () => {
    verify.mockResolvedValue(paidTx(["ACCT_someone_else"]));
    expect(await confirmPayment(REF)).toBe("review");
    expect(donation.status).toBe("pending");
  });

  it("the charity has no account at this provider: held, never paid to nobody", async () => {
    charity.gateway_subaccount_ref = null;
    verify.mockResolvedValue(paidTx(["ACCT_charity"]));
    expect(await confirmPayment(REF)).toBe("review");
  });

  it("held once: the webhook, the return page and the daily check don't note it again", async () => {
    verify.mockResolvedValue(paidTx([]));
    await confirmPayment(REF);
    await confirmPayment(REF);
    await confirmPayment(REF);
    expect(audits.filter((a) => a.action === "donation.split_mismatch")).toHaveLength(1);
  });

  it("not checked when payments aren't split, or the provider can't say where they went", async () => {
    gateway.splitsPayments = false;
    verify.mockResolvedValue(paidTx([]));
    expect(await confirmPayment(REF)).toBe("paid");
    donation.status = "pending";
    gateway.splitsPayments = true;
    gateway.reportsSplit = undefined;
    expect(await confirmPayment(REF)).toBe("paid");
  });
});

describe("a held payment a person has checked", () => {
  it("an admin who checked at the provider can confirm it: paid, emailed, and who did it is logged", async () => {
    verify.mockResolvedValue(paidTx([]));
    expect(await confirmPayment(REF)).toBe("review");
    expect(await confirmPayment(REF, { splitCheckedBy: "admin-1" })).toBe("paid");
    expect(donation.status).toBe("paid");
    expect(events).toContain("emailed");
    expect(audits).toContainEqual(expect.objectContaining({ action: "donation.split_accepted", entityId: REF }));
  });

  it("the admin's check skips only the split: a wrong amount is still held", async () => {
    verify.mockResolvedValue({ ...paidTx([]), amountCents: 1 });
    expect(await confirmPayment(REF, { splitCheckedBy: "admin-1" })).toBe("review");
    expect(donation.status).toBe("pending");
  });
});

describe("reading the provider's answer for the split account", () => {
  it("finds the code in the single-subaccount form", () => {
    expect(splitAccounts({ subaccount: { id: 1, subaccount_code: "ACCT_a" }, split: {} })).toEqual(["ACCT_a"]);
  });
  it("finds the code inside an inline split, as an object or a plain code", () => {
    expect(splitAccounts({ subaccount: {}, split: { type: "flat", subaccounts: [{ subaccount: { subaccount_code: "ACCT_b" }, share: 5000 }] } })).toEqual(["ACCT_b"]);
    expect(splitAccounts({ split: { subaccounts: [{ subaccount: "ACCT_c", share: 5000 }] } })).toEqual(["ACCT_c"]);
  });
  it("finds nothing when the payment wasn't split", () => {
    expect(splitAccounts({ subaccount: {}, split: {} })).toEqual([]);
    expect(splitAccounts({})).toEqual([]);
    expect(splitAccounts(null)).toEqual([]);
  });
});
