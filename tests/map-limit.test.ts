import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/receipts/store", () => ({ getRun: vi.fn(), listWaitingRuns: vi.fn(), listUnfinishedRuns: vi.fn(), yearsWithReceipts: vi.fn(), listUnknownReceiptEmails: vi.fn(), pendingAtYearEnd: vi.fn(), loadPlan: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { mapLimit } = await import("@/lib/receipts/admin-reads");

describe("mapLimit (review 24/11/2026)", () => {
  it("never runs more than the limit at once, and keeps the order of the results", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(peak).toBe(4);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });
  it("copes with nothing to do", async () => {
    expect(await mapLimit([], 4, async (n: number) => n)).toEqual([]);
  });
});
