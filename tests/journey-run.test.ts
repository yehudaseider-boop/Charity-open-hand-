/** The daily journey run before its migration has run: nothing to do and nothing to report (review 10/11/2026). */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.charity_journeys' in the schema cache" } }).then(ok),
      };
      return q;
    },
  }),
}));

const { runJourneys, isMissingTable } = await import("@/lib/charity/journey-store");

describe("the daily journey run", () => {
  it("says 'not set up' instead of failing when the journey's tables aren't there yet", async () => {
    await expect(runJourneys(new Date(), Date.now() + 10_000)).resolves.toMatchObject({ notSetUp: true, sent: 0, enrolled: 0 });
    expect(isMissingTable({ code: "42P01" })).toBe(true);
    expect(isMissingTable({ code: "42501" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
