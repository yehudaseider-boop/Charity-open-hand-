/**
 * Refunds and chargebacks: a full refund marks a paid donation refunded; a partial refund, an unknown
 * payment or any dispute is held for a person; an issued s18A receipt with the donation is flagged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Donation = { id: string; gateway_ref: string; status: string; total_charged_cents: number };
let donations: Donation[];
let receiptLinks: { receipt_id: string; donation_id: string }[];
const audits: { action: string; entityId?: string | null; details?: Record<string, unknown> }[] = [];

vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; entityId?: string | null; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const f: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Record<string, unknown>) => ((patch = p), q),
        eq: (c: string, v: unknown) => ((f[c] = v), q),
        maybeSingle: async () => {
          const d = donations.find((x) => (f.gateway_ref === undefined || x.gateway_ref === f.gateway_ref) && (f.id === undefined || x.id === f.id));
          return { data: d ?? null, error: null };
        },
        then: (ok: (v: unknown) => unknown) => {
          if (table === "s18a_receipt_donations") return Promise.resolve({ data: receiptLinks.filter((l) => l.donation_id === f.donation_id), error: null }).then(ok);
          // donations update ... eq(id).eq(status = paid).select(id)
          const hit = donations.filter((d) => d.id === f.id && d.status === f.status);
          if (patch) for (const d of hit) d.status = String(patch.status);
          return Promise.resolve({ data: hit.map((d) => ({ id: d.id })), error: null }).then(ok);
        },
      };
      return q;
    },
  }),
}));

const { handleDispute, handleRefund, reverseDonation } = await import("@/lib/donations/reverse");

beforeEach(() => {
  donations = [{ id: "d1", gateway_ref: "ref-1", status: "paid", total_charged_cents: 20_000 }];
  receiptLinks = [];
  audits.length = 0;
});

describe("refunds", () => {
  it("a full refund marks the donation refunded, once", async () => {
    await handleRefund("ref-1", 20_000, "evt");
    expect(donations[0].status).toBe("refunded");
    expect(audits.map((a) => a.action)).toEqual(["donation.refunded"]);
    await handleRefund("ref-1", 20_000, "evt");
    expect(audits.map((a) => a.action)).toEqual(["donation.refunded"]);
  });

  it("a partial refund or an unknown amount changes nothing and is held for a person", async () => {
    await handleRefund("ref-1", 5_000, "evt");
    await handleRefund("ref-1", null, "evt");
    expect(donations[0].status).toBe("paid");
    expect(audits.map((a) => a.action)).toEqual(["donation.refund_review", "donation.refund_review"]);
  });

  it("a refund for a payment we don't know is held, and changes nothing", async () => {
    await handleRefund("nope", 20_000, "evt-9");
    await handleRefund(null, 20_000, "evt-9");
    expect(audits.map((a) => a.action)).toEqual(["refund.unmatched", "refund.unmatched"]);
  });

  it("flags an issued s18A receipt that had the donation on it", async () => {
    receiptLinks = [{ receipt_id: "rcpt-1", donation_id: "d1" }];
    expect(await reverseDonation("d1", "charged_back", "admin-1", "marked by an admin")).toBe("done");
    expect(donations[0].status).toBe("charged_back");
    expect(audits.map((a) => [a.action, a.entityId])).toEqual([["donation.charged_back", "d1"], ["receipt.needs_reissue", "rcpt-1"]]);
  });

  it("only a paid donation can be reversed", async () => {
    donations[0].status = "failed";
    expect(await reverseDonation("d1", "refunded", "admin-1", "x")).toBe("not_paid");
    expect(await reverseDonation("zzz", "refunded", "admin-1", "x")).toBe("not_found");
  });
});

describe("disputes", () => {
  it("never change a donation by themselves: held for a person", async () => {
    await handleDispute("ref-1", "opened", null, "evt");
    await handleDispute("ref-1", "resolved", "declined", "evt");
    expect(donations[0].status).toBe("paid");
    expect(audits.map((a) => [a.action, a.entityId])).toEqual([["donation.dispute_opened", "d1"], ["donation.dispute_resolved", "d1"]]);
  });
});
