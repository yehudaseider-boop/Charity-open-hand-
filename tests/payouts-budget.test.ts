/** Reading payouts in a time budget (review of 12/11/2026): it stops cleanly, says so, and skips payouts already final. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const asked: { charityId: string; skipRefs?: ReadonlySet<string>; deadline?: number }[] = [];
let slow = 0;
vi.mock("@/lib/gateway", () => ({
  getGateway: () => ({
    name: "test",
    listPayouts: async (a: { charityId: string; skipRefs?: ReadonlySet<string>; deadline?: number }) => {
      asked.push(a);
      if (slow) await new Promise((r) => setTimeout(r, slow));
      return [];
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        not: () => q,
        in: () => q,
        order: async () => ({ data: [{ id: "c1", gateway_subaccount_ref: "A1" }, { id: "c2", gateway_subaccount_ref: "A2" }, { id: "c3", gateway_subaccount_ref: "A3" }], error: null }),
        limit: async () => ({ data: table === "payouts" ? [{ gateway_payout_ref: "P1" }, { gateway_payout_ref: "P2" }] : [], error: null }),
      };
      return q;
    },
  }),
}));

const { syncPayouts } = await import("@/lib/donations/payouts");
const DAY0 = new Date(Date.UTC(2026, 10, 12, 6) - (Math.floor(Date.UTC(2026, 10, 12, 6) / 86_400_000) % 3) * 86_400_000);

beforeEach(() => {
  asked.length = 0;
  slow = 0;
});

describe("payouts in a time budget", () => {
  it("with time, reads every charity, skipping payouts already kept as final", async () => {
    const s = await syncPayouts(DAY0, { deadline: Date.now() + 10_000 });
    expect(s).toMatchObject({ charities: 3, failed: [] });
    expect(s.outOfTime).toBeUndefined();
    expect([...asked[0].skipRefs!]).toEqual(["P1", "P2"]);
    expect(asked[0].deadline).toBeGreaterThan(Date.now());
  });

  it("out of time, starts no more charities, and says how many were not reached", async () => {
    const s = await syncPayouts(DAY0, { deadline: Date.now() - 1 });
    expect(asked).toEqual([]);
    expect(s).toMatchObject({ charities: 0, outOfTime: true, notReached: 3 });
  });

  it("running out part-way through a charity is reported too", async () => {
    slow = 30;
    const s = await syncPayouts(DAY0, { deadline: Date.now() + 10 });
    expect(asked).toHaveLength(1);
    expect(s).toMatchObject({ outOfTime: true, notReached: 2 });
  });

  it("starts with a different charity each day, so the same ones are never always left for tomorrow", async () => {
    await syncPayouts(DAY0);
    const first = asked.map((a) => a.charityId);
    asked.length = 0;
    await syncPayouts(new Date(DAY0.getTime() + 86_400_000));
    expect(first).toEqual(["c1", "c2", "c3"]);
    expect(asked.map((a) => a.charityId)).toEqual(["c2", "c3", "c1"]);
  });
});
