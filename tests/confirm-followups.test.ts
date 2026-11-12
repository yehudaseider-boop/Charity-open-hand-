/**
 * confirmPayment's follow-ups (review of 12/11/2026): the confirmation email is noted as owed before a gift is saved
 * as paid (so a process that stops in between still sends it, once), an amount mismatch is held for a person once,
 * and the daily check closes old checkouts the payment provider says were abandoned or never received. The database,
 * the provider and the emails are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; status: string; gateway: string; total_charged_cents: number; recurring_id: string | null; created_at: string; gateway_ref: string };
let donation: Row;
let audits: { action: string; entityId?: string | null; details?: unknown }[];
let recurring: { id: string; first_donation_id: string }[];
const events: string[] = [];
const verify = vi.fn();

vi.mock("@/lib/audit", () => ({
  logAudit: async (e: { action: string; entityId?: string | null; details?: unknown }) => {
    audits.push(e);
  },
}));
vi.mock("@/lib/gateway", () => ({ gatewayByName: () => ({ verifyTransaction: verify }), getGateway: () => ({ name: "test" }) }));
vi.mock("@/lib/donations/notify", () => ({
  oweDonorConfirmation: async () => void events.push(`owed while ${donation.status}`),
  notifyDonationPaid: async () => void events.push(`sent while ${donation.status}`),
}));
vi.mock("@/lib/donations/giving-guard", () => ({ recordDecline: async () => void events.push("decline counted") }));
vi.mock("@/lib/donations/saved-card", () => ({ cardSaveWaitingFor: async () => false, finishCardSave: async () => "none" }));
vi.mock("@/lib/donations/new-card", () => ({ newCardWaitingFor: async () => false, finishNewCard: async () => ({ finishedHere: false }) }));
vi.mock("@/lib/donations/recurring", () => ({
  FIRST_PAYMENT_FAILED: "the first payment failed",
  activateMonthlyDonation: async () => "none",
  cancelMonthlyBeforeStart: async (id: string) => void events.push(`monthly closed for ${id}`),
  monthlyHandledElsewhere: async () => false,
  monthlyWaitingFor: async () => false,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const matches = (r: Record<string, unknown>) => filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v));
      const rows = (): Record<string, unknown>[] => (table === "donations" ? [donation] : table === "audit_log" ? audits.map((a) => ({ id: "a", action: a.action, entity_id: a.entityId })) : table === "recurring_donations" ? recurring : []);
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
          } else resolve({ data: [], error: null });
        },
      };
      return q;
    },
  }),
}));

const { confirmPayment } = await import("@/lib/donations/confirm");
const { GatewayError } = await import("@/lib/gateway/types");
const REF = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-11-12T08:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const closeAbandonedBefore = new Date(NOW.getTime() - 48 * 3_600_000);

beforeEach(() => {
  donation = { id: REF, status: "pending", gateway: "test", total_charged_cents: 20_000, recurring_id: null, created_at: hoursAgo(1), gateway_ref: REF };
  audits = [];
  recurring = [];
  events.length = 0;
  verify.mockReset();
});

describe("the confirmation email is never lost if the process stops", () => {
  it("is noted as owed before the gift is saved as paid, then sent", async () => {
    verify.mockResolvedValue({ status: "success", amountCents: 20_000, currency: "ZAR", paidAt: "2026-11-12T07:00:00Z" });
    expect(await confirmPayment(REF)).toBe("paid");
    expect(events).toEqual(["owed while pending", "sent while paid"]);
  });

  it("a later check of a gift already paid sends nothing again (the note left by the first call is what sends it)", async () => {
    donation.status = "paid";
    expect(await confirmPayment(REF)).toBe("paid");
    expect(events).toEqual([]);
  });
});

describe("a payment for a different amount", () => {
  it("is held for a person once, however often it is checked", async () => {
    verify.mockResolvedValue({ status: "success", amountCents: 19_000, currency: "ZAR" });
    expect(await confirmPayment(REF)).toBe("review");
    expect(await confirmPayment(REF)).toBe("review");
    expect(await confirmPayment(REF)).toBe("review");
    expect(audits.filter((a) => a.action === "donation.amount_mismatch")).toHaveLength(1);
    expect(donation.status).toBe("pending");
  });
});

describe("old checkouts the donor never paid (daily check only)", () => {
  const abandoned = { status: "pending", abandoned: true, amountCents: 20_000, currency: "ZAR" };

  it("an abandoned one older than 48 hours is closed as failed, never counted as a declined card", async () => {
    donation.created_at = hoursAgo(50);
    verify.mockResolvedValue(abandoned);
    expect(await confirmPayment(REF, { closeAbandonedBefore })).toBe("failed");
    expect(donation.status).toBe("failed");
    expect(events).not.toContain("decline counted");
    expect(audits).toEqual([expect.objectContaining({ action: "donation.checkout_closed", details: { why: "abandoned" } })]);
  });

  it("one the provider never received is closed the same way", async () => {
    donation.created_at = hoursAgo(80);
    verify.mockRejectedValue(new GatewayError("not found", { notFound: true }));
    expect(await confirmPayment(REF, { closeAbandonedBefore })).toBe("failed");
    expect(audits[0]).toMatchObject({ details: { why: "never_received" } });
  });

  it("a recent one, or any check that isn't the daily one, leaves it pending", async () => {
    donation.created_at = hoursAgo(20);
    verify.mockResolvedValue(abandoned);
    expect(await confirmPayment(REF, { closeAbandonedBefore })).toBe("pending");
    donation.created_at = hoursAgo(80);
    expect(await confirmPayment(REF)).toBe("pending");
    verify.mockRejectedValue(new GatewayError("not found", { notFound: true }));
    await expect(confirmPayment(REF)).rejects.toThrow(/not found/);
    expect(donation.status).toBe("pending");
  });

  it("a payment the provider is still working on (not abandoned) is never closed: the stuck-payment alert still sees it", async () => {
    donation.created_at = hoursAgo(80);
    verify.mockResolvedValue({ ...abandoned, abandoned: false });
    expect(await confirmPayment(REF, { closeAbandonedBefore })).toBe("pending");
    verify.mockRejectedValue(new GatewayError("down", { unreachable: true }));
    await expect(confirmPayment(REF, { closeAbandonedBefore })).rejects.toThrow(/down/);
    expect(donation.status).toBe("pending");
  });

  it("a monthly donation's first payment is closed, and its monthly donation with it (it still starts if paid later)", async () => {
    donation.created_at = hoursAgo(50);
    donation.recurring_id = "rec1";
    recurring = [{ id: "rec1", first_donation_id: REF }];
    verify.mockResolvedValue(abandoned);
    expect(await confirmPayment(REF, { closeAbandonedBefore })).toBe("failed");
    expect(events).toContain(`monthly closed for ${REF}`);
  });

  it("a monthly collection or a new card is never closed here (their own jobs settle them)", async () => {
    donation.created_at = hoursAgo(80);
    donation.recurring_id = "rec1";
    recurring = [{ id: "rec1", first_donation_id: "someone-else" }];
    verify.mockResolvedValue(abandoned);
    expect(await confirmPayment(REF, { closeAbandonedBefore })).toBe("pending");
    expect(donation.status).toBe("pending");
  });

  it("a closed checkout still becomes paid if the provider later says so", async () => {
    donation.created_at = hoursAgo(50);
    verify.mockResolvedValue(abandoned);
    await confirmPayment(REF, { closeAbandonedBefore });
    verify.mockResolvedValue({ status: "success", amountCents: 20_000, currency: "ZAR", paidAt: "2026-11-12T07:00:00Z" });
    expect(await confirmPayment(REF)).toBe("paid");
    expect(donation.status).toBe("paid");
  });
});
