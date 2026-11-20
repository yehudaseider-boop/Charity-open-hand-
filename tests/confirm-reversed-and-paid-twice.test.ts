/**
 * Two money-safety fixes in confirmPayment (review 20/11/2026):
 * - a payment the provider took and then gave back before we confirmed it is held for a person, never recorded as a
 *   declined card (no decline counted, no monthly donation closed as "the first payment failed");
 * - an old-card monthly try confirmed paid late, for a month the donor already paid with a new card ("Update my
 *   card"), is flagged as paid twice, like two paid tries of the old card.
 * The database, the provider, the alert and the emails are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; status: string; gateway: string; total_charged_cents: number; recurring_id: string | null; created_at: string; gateway_ref: string };
let donation: Row;
let audits: { action: string; entityId?: string | null; details?: unknown }[];
let otherGifts: { id: string; status: string }[];
let cardUpdates: { donation_id: string; recurring_id: string; period: string; "donations.status": string }[];
const alerts: { subject: string; lines: string[] }[] = [];
const events: string[] = [];
const verify = vi.fn();

vi.mock("@/lib/audit", () => ({
  logAudit: async (e: { action: string; entityId?: string | null; details?: unknown }) => {
    audits.push(e);
  },
}));
vi.mock("@/lib/ops/alert", () => ({ alertGivezy: async (subject: string, lines: string[]) => (alerts.push({ subject, lines }), "sent") }));
vi.mock("@/lib/gateway", () => ({ gatewayByName: () => ({ verifyTransaction: verify }), getGateway: () => ({ name: "test" }) }));
vi.mock("@/lib/donations/notify", () => ({
  oweDonorConfirmation: async () => undefined,
  notifyDonationPaid: async () => void events.push("confirmation sent"),
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
      const rows = (): Record<string, unknown>[] =>
        table === "donations"
          ? [donation, ...otherGifts]
          : table === "audit_log"
            ? audits.map((a) => ({ id: "a", action: a.action, entity_id: a.entityId }))
            : table === "monthly_card_updates"
              ? cardUpdates
              : [];
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
const { attemptDonationId } = await import("@/lib/donations/schedule");
const REF = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  donation = { id: REF, status: "pending", gateway: "test", total_charged_cents: 20_000, recurring_id: null, created_at: "2026-11-12T07:00:00Z", gateway_ref: REF };
  audits = [];
  otherGifts = [];
  cardUpdates = [];
  alerts.length = 0;
  events.length = 0;
  verify.mockReset();
});

describe("a payment the provider refunded before we confirmed it", () => {
  const reversed = { status: "failed", reversed: true, amountCents: 20_000, currency: "ZAR" };

  it("is held for a person once, never marked failed and never counted as a declined card", async () => {
    verify.mockResolvedValue(reversed);
    expect(await confirmPayment(REF)).toBe("review");
    expect(await confirmPayment(REF)).toBe("review");
    expect(donation.status).toBe("pending");
    expect(events).not.toContain("decline counted");
    expect(audits.filter((a) => a.action === "donation.refund_review")).toEqual([
      expect.objectContaining({ entityId: REF, details: expect.objectContaining({ reversedBeforeConfirmed: true }) }),
    ]);
  });

  it("never closes a monthly donation as 'the first payment failed'", async () => {
    donation.recurring_id = "rec1";
    verify.mockResolvedValue(reversed);
    expect(await confirmPayment(REF)).toBe("review");
    expect(events).toEqual([]);
    expect(donation.status).toBe("pending");
  });

  it("one already saved as failed is held too, and left as it is", async () => {
    donation.status = "failed";
    verify.mockResolvedValue(reversed);
    expect(await confirmPayment(REF)).toBe("review");
    expect(donation.status).toBe("failed");
    expect(events).toEqual([]);
  });

  it("a plain decline is still a decline", async () => {
    verify.mockResolvedValue({ status: "failed", amountCents: 20_000, currency: "ZAR" });
    expect(await confirmPayment(REF)).toBe("failed");
    expect(events).toContain("decline counted");
  });
});

describe("a month paid with the new card and then by a late old-card try", () => {
  const firstTry = attemptDonationId("rec1", "2026-11", 0);
  const paidTx = { status: "success", amountCents: 20_000, currency: "ZAR", paidAt: "2026-11-17T07:00:00Z" };
  beforeEach(() => {
    donation = { ...donation, id: firstTry, gateway_ref: firstTry, recurring_id: "rec1", created_at: "2026-11-15T06:30:00Z" };
  });

  it("is flagged once for a person, and the team is told", async () => {
    cardUpdates = [{ donation_id: "new-card-gift", recurring_id: "rec1", period: "2026-11", "donations.status": "paid" }];
    verify.mockResolvedValue(paidTx);
    expect(await confirmPayment(firstTry)).toBe("paid");
    expect(audits.filter((a) => a.action === "monthly.paid_twice")).toEqual([
      expect.objectContaining({ entityId: firstTry, details: { recurring: "rec1", period: "2026-11", alsoPaid: ["new-card-gift"], newCard: ["new-card-gift"] } }),
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].lines[0]).toContain("11/2026");
    // Asked again later: still one row, one alert.
    donation.status = "pending";
    await confirmPayment(firstTry);
    expect(audits.filter((a) => a.action === "monthly.paid_twice")).toHaveLength(1);
    expect(alerts).toHaveLength(1);
  });

  it("a new card for another month, or one not paid, is not a second payment", async () => {
    cardUpdates = [
      { donation_id: "october-card", recurring_id: "rec1", period: "2026-10", "donations.status": "paid" },
      { donation_id: "closed-page", recurring_id: "rec1", period: "2026-11", "donations.status": "failed" },
      { donation_id: "someone-else", recurring_id: "rec2", period: "2026-11", "donations.status": "paid" },
    ];
    verify.mockResolvedValue(paidTx);
    expect(await confirmPayment(firstTry)).toBe("paid");
    expect(audits.filter((a) => a.action === "monthly.paid_twice")).toEqual([]);
    expect(alerts).toEqual([]);
  });
});
