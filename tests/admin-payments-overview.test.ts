import { describe, expect, it } from "vitest";
import { monthlyHealth, staleEvents, stalePending, totalsByCharity } from "@/lib/admin/payments-overview";

const NOW = new Date("2026-10-13T10:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

describe("payments overview", () => {
  it("lists only payments pending longer than 30 minutes, oldest first, with the donor-facing reference", () => {
    const rows = stalePending(
      [
        { id: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc", created_at: ago(95), total_charged_cents: "18000", charity: "Meals" },
        { id: "aaaaaaaa-0b1d-4e5f-9a8b-123456789abc", created_at: ago(5), total_charged_cents: 5000, charity: "Meals" },
        { id: "bbbbbbbb-0b1d-4e5f-9a8b-123456789abc", created_at: ago(31), total_charged_cents: 3000, charity: "Shul" },
      ],
      NOW,
    );
    expect(rows.map((r) => [r.reference, r.minutes, r.totalCents])).toEqual([["GZ-3F9A2C71", 95, 18000], ["GZ-BBBBBBBB", 31, 3000]]);
  });

  it("lists only payment events unfinished for more than 5 minutes", () => {
    const rows = staleEvents(
      [
        { id: "e1", gateway: "paystack", event_type: "payment_succeeded", received_at: ago(2), reference: null },
        { id: "e2", gateway: "paystack", event_type: "payment_succeeded", received_at: ago(60), reference: "3f9a2c71-0b1d-4e5f-9a8b-123456789abc" },
        { id: "e3", gateway: "paystack", event_type: "other", received_at: ago(600), reference: null },
      ],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["e3", "e2"]);
    expect(rows[1].reference).toBe("GZ-3F9A2C71");
  });

  it("adds up per charity: donations to the charity, contributions to Givezy, in whole cents", () => {
    const t = totalsByCharity([
      { charity_id: "a", charity: "Meals", amount_cents: "18000", contribution_cents: "2000" },
      { charity_id: "a", charity: "Meals", amount_cents: 5000, contribution_cents: 0 },
      { charity_id: "b", charity: "Shul", amount_cents: "100000", contribution_cents: "1000" },
    ]);
    expect(t.list.map((x) => [x.charity, x.count, x.donationCents, x.contributionCents])).toEqual([["Shul", 1, 100_000, 1_000], ["Meals", 2, 23_000, 2_000]]);
    expect(t).toMatchObject({ count: 3, donationCents: 123_000, contributionCents: 3_000 });
  });

  it("monthly donations: counts, the failed ones, and ones overdue by a day or more", () => {
    const h = monthlyHealth(
      [
        { id: "1", status: "active", next_charge_at: ago(60 * 30), last_attempt_at: ago(60 * 40), charity: "Meals", amount_cents: 18000, contribution_cents: 2000 },
        { id: "2", status: "active", next_charge_at: ago(60 * 2), last_attempt_at: null, charity: "Meals", amount_cents: 100, contribution_cents: 0 },
        { id: "3", status: "paused", next_charge_at: null, last_attempt_at: null, charity: "Shul", amount_cents: 100, contribution_cents: 0 },
        { id: "4", status: "failed", next_charge_at: null, last_attempt_at: ago(10), charity: "Shul", amount_cents: "5000", contribution_cents: "500" },
      ],
      NOW,
    );
    expect(h).toMatchObject({ active: 2, paused: 1, overdue: 1, lastAttemptAt: ago(10) });
    expect(h.failed).toEqual([{ id: "4", charity: "Shul", monthlyCents: 5_500 }]);
  });

  it("nothing at all is fine", () => {
    expect(totalsByCharity([])).toMatchObject({ list: [], count: 0, donationCents: 0 });
    expect(monthlyHealth([], NOW)).toMatchObject({ active: 0, overdue: 0, lastAttemptAt: null, failed: [] });
  });
});
