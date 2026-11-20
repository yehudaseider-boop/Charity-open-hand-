/**
 * "Update my card" while an old-card monthly try is still held by the payment provider (review 20/11/2026): the try
 * may still be paid, so a new-card payment is refused with a plain message however old the try is, rather than
 * letting the donor pay the month twice. The database and the charity are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");

const RID = "6f52c335-dd9e-4ee2-8843-7eee93fceb76";
const FIRST = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-20T08:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let gifts: { id: string; recurring_id: string; status: string; created_at: string }[];
let cardUpdates: { donation_id: string; recurring_id: string; finished_at: string | null; "donations.status": string }[];
const monthly = {
  id: RID,
  status: "active",
  amount_cents: 20_000,
  contribution_cents: 0,
  covers_card_charge: false,
  card_last4: "4081",
  charge_day: 15,
  last_paid_period: "2026-10",
  attempt_period: "2026-11",
  failed_attempts: 1,
  last_attempt_at: daysAgo(4),
  ended_reason: null,
  first_donation_id: FIRST,
  gateway: "test",
  charities: { slug: "a-charity", name_en: "A Charity" },
};

vi.mock("@/lib/gateway", () => ({ getGateway: () => ({ name: "test" }) }));
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => ({ acceptingPayments: true, splitAccountRef: null }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const tests: ((r: Record<string, unknown>) => boolean)[] = [];
      const rows = (): Record<string, unknown>[] => (table === "donations" ? gifts : table === "monthly_card_updates" ? cardUpdates : table === "recurring_donations" ? [monthly] : []);
      const found = () => rows().filter((r) => tests.every((t) => t(r)));
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (tests.push((r) => r[c] === v), q),
        neq: (c: string, v: unknown) => (tests.push((r) => r[c] !== v), q),
        is: (c: string, v: unknown) => (tests.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (tests.push((r) => v.includes(r[c])), q),
        gte: (c: string, v: string) => (tests.push((r) => String(r[c]) >= v), q),
        limit: async () => ({ data: found(), error: null }),
        maybeSingle: async () => ({ data: found()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: found(), error: null }),
      };
      return q;
    },
  }),
}));

const { loadNewCardOffer, offerMessage } = await import("@/lib/donations/new-card");
const { attemptDonationId } = await import("@/lib/donations/schedule");
const NOV_TRY = attemptDonationId(RID, "2026-11", 0);

beforeEach(() => {
  gifts = [{ id: FIRST, recurring_id: RID, status: "paid", created_at: daysAgo(60) }];
  cardUpdates = [];
});

describe("an old-card try still waiting on the payment provider", () => {
  it("is offered when nothing is unsettled", async () => {
    expect(await loadNewCardOffer(RID, NOW)).toMatchObject({ ok: true, totalCents: 20_000 });
  });

  it("blocks a new-card payment while it is recent", async () => {
    gifts.push({ id: NOV_TRY, recurring_id: RID, status: "pending", created_at: daysAgo(1) });
    expect(await loadNewCardOffer(RID, NOW)).toEqual({ ok: false, reason: "busy" });
  });

  it("a try from months ago left for a person to settle never blocks it (review 20/11/2026)", async () => {
    gifts.push({ id: attemptDonationId(RID, "2026-08", 0), recurring_id: RID, status: "pending", created_at: daysAgo(90) });
    expect(await loadNewCardOffer(RID, NOW)).toMatchObject({ ok: true });
  });

  it("still blocks it after 48 hours: it may yet be paid, and the month would be paid twice", async () => {
    gifts.push({ id: NOV_TRY, recurring_id: RID, status: "pending", created_at: daysAgo(4) });
    expect(await loadNewCardOffer(RID, NOW)).toEqual({ ok: false, reason: "busy" });
    expect(offerMessage("busy")).toMatch(/Nothing more was charged/);
  });

  it("a settled try, or an old new-card page the donor left unpaid, doesn't block", async () => {
    gifts.push({ id: "try-1", recurring_id: RID, status: "failed", created_at: daysAgo(4) });
    gifts.push({ id: "old-page", recurring_id: RID, status: "pending", created_at: daysAgo(4) });
    cardUpdates.push({ donation_id: "old-page", recurring_id: RID, finished_at: null, "donations.status": "pending" });
    expect(await loadNewCardOffer(RID, NOW)).toMatchObject({ ok: true });
  });
});
