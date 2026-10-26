/**
 * Refunds and chargebacks: a full refund marks a paid donation refunded; a partial refund, an unknown
 * payment or any dispute is held for a person; an issued s18A receipt with the donation is withdrawn and flagged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Donation = { id: string; gateway_ref: string; status: string; total_charged_cents: number; recurring_id?: string | null };
let donations: Donation[];
let recurring: { id: string; status: string; authorization_encrypted: string | null; ended_reason?: string | null; held_reason?: string | null }[];
let voided: string[];
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
        in: (c: string, v: unknown[]) => ((f[`${c}:in`] = v), q),
        not: (c: string) => ((f[`${c}:set`] = true), q),
        then: (ok: (v: unknown) => unknown) => {
          if (table === "s18a_receipt_donations") return Promise.resolve({ data: receiptLinks.filter((l) => l.donation_id === f.donation_id), error: null }).then(ok);
          if (table === "s18a_receipts") {
            if (patch?.status === "void" && f.status === "issued") voided.push(String(f.id));
            return Promise.resolve({ data: null, error: null }).then(ok);
          }
          if (table === "recurring_donations") {
            const allowed = (f["status:in"] as string[] | undefined) ?? (f.status ? [f.status] : null);
            const hit = recurring.filter((r) => r.id === f.id && (!allowed || allowed.includes(r.status)) && (!f["held_reason:set"] || r.held_reason != null));
            if (patch) for (const r of hit) Object.assign(r, patch);
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(ok);
          }
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

const { handleDispute, handleRefund, releaseDisputeHold, reverseDonation } = await import("@/lib/donations/reverse");

beforeEach(() => {
  donations = [{ id: "d1", gateway_ref: "ref-1", status: "paid", total_charged_cents: 20_000 }];
  recurring = [];
  receiptLinks = [];
  voided = [];
  audits.length = 0;
});

describe("refunds", () => {
  it("a full refund marks the donation refunded; a repeat changes nothing else", async () => {
    await handleRefund("ref-1", 20_000, "evt");
    expect(donations[0].status).toBe("refunded");
    expect(audits.map((a) => a.action)).toEqual(["donation.refunded"]);
    // Only an unfinished event is ever processed again (finished ones are skipped by the webhook route).
    await handleRefund("ref-1", 20_000, "evt");
    expect(donations[0].status).toBe("refunded");
    expect(audits.map((a) => a.action)).not.toContain("donation.refund_review");
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

  it("withdraws an issued s18A receipt that had the donation on it, and flags it for re-issue", async () => {
    receiptLinks = [{ receipt_id: "rcpt-1", donation_id: "d1" }];
    expect(await reverseDonation("d1", "charged_back", "admin-1", "marked by an admin")).toBe("done");
    expect(donations[0].status).toBe("charged_back");
    expect(voided).toEqual(["rcpt-1"]);
    expect(audits.map((a) => [a.action, a.entityId])).toEqual([["donation.charged_back", "d1"], ["receipt.voided", "rcpt-1"], ["receipt.needs_reissue", "rcpt-1"]]);
  });

  it("a retry after a failed first try still flags the receipt", async () => {
    receiptLinks = [{ receipt_id: "rcpt-1", donation_id: "d1" }];
    donations[0].status = "refunded"; // the first try changed it, then failed before logging
    await handleRefund("ref-1", 20_000, "evt");
    expect(voided).toEqual(["rcpt-1"]);
    expect(audits.map((a) => a.action)).toEqual(["donation.refunded", "receipt.voided", "receipt.needs_reissue"]);
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

describe("monthly donations behind a reversed payment", () => {
  beforeEach(() => {
    donations = [{ id: "d1", gateway_ref: "ref-1", status: "paid", total_charged_cents: 20_000, recurring_id: "rec1" }];
    recurring = [{ id: "rec1", status: "active", authorization_encrypted: "card" }];
  });

  it("a chargeback ends the monthly donation and drops the card, so it is never charged again", async () => {
    expect(await reverseDonation("d1", "charged_back", "admin", "the bank reversed it")).toBe("done");
    expect(recurring[0]).toMatchObject({ status: "cancelled", authorization_encrypted: null, ended_reason: "the payment was charged back" });
    expect(audits.map((a) => a.action)).toContain("recurring.cancelled");
  });

  it("a refund leaves the monthly donation running (a goodwill refund is not a dispute)", async () => {
    expect(await reverseDonation("d1", "refunded", null, "refunded")).toBe("done");
    expect(recurring[0].status).toBe("active");
  });

  it("an opened dispute pauses and holds it until a person has looked; a resolved one changes nothing", async () => {
    await handleDispute("ref-1", "opened", null, "ev1");
    expect(recurring[0].status).toBe("paused");
    expect(recurring[0].held_reason).toBe("a payment was disputed");
    expect(donations[0].status).toBe("paid");
    recurring[0].status = "active";
    await handleDispute("ref-1", "resolved", "won", "ev2");
    expect(recurring[0].status).toBe("active");
  });

  it("a dispute holds a donation the donor had paused too; a person releases the hold once it is won", async () => {
    recurring[0].status = "paused";
    await handleDispute("ref-1", "opened", null, "ev1");
    expect(recurring[0].held_reason).toBe("a payment was disputed");
    expect(await releaseDisputeHold("d1", "admin-1")).toBe(true);
    expect(recurring[0]).toMatchObject({ status: "paused", held_reason: null });
    expect(await releaseDisputeHold("d1", "admin-1")).toBe(false);
    expect(audits.at(-1)?.action).toBe("recurring.hold_released");
  });

  it("a refund in another currency is never matched by its number alone", async () => {
    await handleRefund("ref-1", 20_000, "ev3", "USD");
    expect(donations[0].status).toBe("paid");
    expect(audits.at(-1)?.action).toBe("donation.refund_review");
    await handleRefund("ref-1", 20_000, "ev4", null);
    expect(donations[0].status).toBe("paid");
  });
});
