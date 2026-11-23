import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const stored = new Map<string, { token_hash: string; created_at: string }>();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (r: { donation_id: string; token_hash: string }) => (stored.set(r.donation_id, { token_hash: r.token_hash, created_at: new Date().toISOString() }), { error: null }),
      upsert: async (r: { donation_id: string; token_hash: string; created_at: string }) => (stored.set(r.donation_id, { token_hash: r.token_hash, created_at: r.created_at }), { error: null }),
      select: () => {
        let id = "";
        const q = { eq: (_c: string, v: string) => ((id = v), q), maybeSingle: async () => ({ data: stored.get(id) ?? null, error: null }) };
        return q;
      },
    }),
  }),
}));
const { issueConfirmationToken, reissueConfirmationToken, confirmationTokenMatches, confirmationAccess } = await import("@/lib/donations/confirmation-access");
const { confirmationLinkExpiresAt, confirmationLinkLive } = await import("@/lib/donations/confirmation-expiry");
const { platformConfig } = await import("@/config/platform");

const DAY = 86_400_000;

describe("confirmation credential", () => {
  it("is long, random, stored only as a hash, and matches only for its own donation", async () => {
    const t = await issueConfirmationToken("don-1");
    const t2 = await issueConfirmationToken("don-2");
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t).not.toBe(t2);
    expect(stored.get("don-1")!.token_hash).not.toContain(t);
    expect(stored.get("don-1")!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await confirmationTokenMatches("don-1", t)).toBe(true);
    expect(await confirmationTokenMatches("don-1", t2)).toBe(false);
    expect(await confirmationTokenMatches("don-2", t)).toBe(false);
    expect(await confirmationTokenMatches("don-1", undefined)).toBe(false);
    expect(await confirmationTokenMatches("don-1", "short")).toBe(false);
    expect(await confirmationTokenMatches("no-such", t)).toBe(false);
  });
});

describe("the link's 30 days (decided 23/11/2026)", () => {
  it("lives in the platform settings", () => {
    expect(platformConfig.confirmationLink.days).toBe(30);
  });

  it("works up to 30 days after it was issued, and not a moment after", () => {
    const issued = new Date("2026-11-01T10:00:00+02:00");
    expect(confirmationLinkExpiresAt(issued).toISOString()).toBe(new Date(issued.getTime() + 30 * DAY).toISOString());
    expect(confirmationLinkLive(issued, issued)).toBe(true);
    expect(confirmationLinkLive(issued, new Date(issued.getTime() + 30 * DAY - 1))).toBe(true);
    expect(confirmationLinkLive(issued, new Date(issued.getTime() + 30 * DAY))).toBe(false);
    expect(confirmationLinkLive(issued.toISOString(), new Date(issued.getTime() + 31 * DAY))).toBe(false);
  });

  it("an unreadable issue time counts as expired, never as open", () => {
    expect(confirmationLinkLive(null)).toBe(false);
    expect(confirmationLinkLive(undefined)).toBe(false);
    expect(confirmationLinkLive("not a date")).toBe(false);
  });

  it("a matching credential past its period is 'expired' and opens nothing; a wrong one stays 'none'", async () => {
    const t = await issueConfirmationToken("don-3");
    const later = new Date(Date.now() + 31 * DAY);
    expect(await confirmationAccess("don-3", t)).toBe("valid");
    expect(await confirmationAccess("don-3", t, later)).toBe("expired");
    expect(await confirmationTokenMatches("don-3", t, later)).toBe(false);
    expect(await confirmationAccess("don-3", "x".repeat(43), later)).toBe("none");
  });

  it("a fresh credential replaces the old one and works for the full period again", async () => {
    const old = await issueConfirmationToken("don-4");
    const later = new Date(Date.now() + 40 * DAY);
    const fresh = await reissueConfirmationToken("don-4", later);
    expect(await confirmationAccess("don-4", fresh, later)).toBe("valid");
    expect(await confirmationAccess("don-4", fresh, new Date(later.getTime() + 29 * DAY))).toBe("valid");
    expect(await confirmationAccess("don-4", fresh, new Date(later.getTime() + 30 * DAY))).toBe("expired");
    // The old link stops working altogether.
    expect(await confirmationAccess("don-4", old, later)).toBe("none");
  });
});
