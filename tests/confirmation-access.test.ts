import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const stored = new Map<string, string>();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (r: { donation_id: string; token_hash: string }) => (stored.set(r.donation_id, r.token_hash), { error: null }),
      select: () => {
        let id = "";
        const q = { eq: (_c: string, v: string) => ((id = v), q), maybeSingle: async () => ({ data: stored.has(id) ? { token_hash: stored.get(id) } : null, error: null }) };
        return q;
      },
    }),
  }),
}));
const { issueConfirmationToken, confirmationTokenMatches } = await import("@/lib/donations/confirmation-access");

describe("confirmation credential", () => {
  it("is long, random, stored only as a hash, and matches only for its own donation", async () => {
    const t = await issueConfirmationToken("don-1");
    const t2 = await issueConfirmationToken("don-2");
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t).not.toBe(t2);
    expect(stored.get("don-1")).not.toContain(t);
    expect(stored.get("don-1")).toMatch(/^[0-9a-f]{64}$/);
    expect(await confirmationTokenMatches("don-1", t)).toBe(true);
    expect(await confirmationTokenMatches("don-1", t2)).toBe(false);
    expect(await confirmationTokenMatches("don-2", t)).toBe(false);
    expect(await confirmationTokenMatches("don-1", undefined)).toBe(false);
    expect(await confirmationTokenMatches("don-1", "short")).toBe(false);
    expect(await confirmationTokenMatches("no-such", t)).toBe(false);
  });
});
