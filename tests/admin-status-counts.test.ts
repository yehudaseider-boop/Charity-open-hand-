/**
 * The admin overview counts charities with one exact count per status, so it stays right past the database's 1 000-row
 * read limit (review 23/11/2026). The database is a stand-in that, like the real one, returns at most 1 000 rows.
 */
import { describe, expect, it } from "vitest";
import { countCharitiesByStatus } from "@/lib/charity/status-counts";

const TOTALS: Record<string, number> = { pending_review: 1234, approved: 2500, rejected: 3, suspended: 0, draft: 1001 };

const database = (fail = false) => ({
  from: () => ({
    select: (_cols: string, opts: { head: true; count: "exact" }) => ({
      eq: (_col: "status", status: string) => Promise.resolve(fail ? { count: null, error: { message: "timeout" } } : { count: opts.head && opts.count === "exact" ? TOTALS[status] : null, error: null }),
    }),
  }),
});

describe("counting charities by status", () => {
  it("gives the real number in each status, even past 1 000", async () => {
    const counts = await countCharitiesByStatus(database());
    expect(counts.get("pending_review")).toBe(1234);
    expect(counts.get("approved")).toBe(2500);
    expect(counts.get("draft")).toBe(1001);
    expect(counts.get("suspended")).toBe(0);
  });

  it("fails loudly rather than showing wrong numbers", async () => {
    await expect(countCharitiesByStatus(database(true))).rejects.toThrow("timeout");
  });
});
