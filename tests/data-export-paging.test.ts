/**
 * "Download my information" reads every part in pages (review 23/11/2026): the database returns at most 1 000 rows at
 * a time, and a part cut there without a word would look complete. A stand-in database holds 2 300 rows of each part
 * and, like the real one, returns at most 1 000 rows per read.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const N = 2300;
const BIG = new Set([
  "donations", "thank_you_dummy", "charity_donor_thanks", "s18a_receipts", "recurring_donations",
  "charity_donor_notes", "charity_donor_reminders", "charity_donor_tags", "charity_appeal_recipients",
]);

function fake(table: string) {
  let range: [number, number] | null = null;
  let inValues: unknown[] | null = null;
  const q: Record<string, unknown> = {
    select: () => q,
    in: (_c: string, v: unknown[]) => ((inValues = v), q),
    eq: () => q,
    is: () => q,
    order: () => q,
    range: (a: number, b: number) => ((range = [a, b]), q),
    maybeSingle: async () => ({ data: table === "profiles" ? { email: "a@example.co.za" } : null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
      if (table === "donors") return resolve({ data: [{ id: "d1", email: "a@example.co.za" }], error: null });
      // One giving-kind row per donation asked about.
      if (table === "donation_giving_kinds") {
        const [a, b] = range ?? [0, 999];
        return resolve({ data: (inValues ?? []).map((id) => ({ donation_id: id, kind: "once" })).slice(a, b + 1), error: null });
      }
      if (!BIG.has(table)) return resolve({ data: [], error: null });
      const all = Array.from({ length: N }, (_, i) => ({ id: `${table}-${i}` }));
      const [a, b] = range ?? [0, N - 1];
      // The database never returns more than 1 000 rows at a time.
      resolve({ data: all.slice(a, Math.min(b, a + 999) + 1), error: null });
    },
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@example.co.za" } } }) }, from: fake }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fake }) }));
vi.mock("@/lib/auth", () => ({ signedInWithPassword: async () => false }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/donations/saved-card", () => ({ loadSavedCardInfo: async () => null }));

const { GET } = await import("@/app/account/data/export/route");

describe("the data download", () => {
  it("returns every row of every part, not only the first 1 000", async () => {
    const res = await GET(new Request("https://givezy.test/account/data/export"));
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text());
    for (const key of [
      "donations", "giving_kinds", "thank_you_notes_from_charities", "s18a_receipts", "monthly_donations",
      "charities_notes_about_you", "charities_follow_ups_about_you", "charities_tags_on_you", "emails_from_charities",
    ]) {
      expect(body[key], key).toHaveLength(N);
    }
  });
});
