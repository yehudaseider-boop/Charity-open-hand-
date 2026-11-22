/**
 * hitRateLimit's forgetRefused option (22/11/2026, review of the dashboard helper): a refused attempt is removed again,
 * so someone who keeps trying while refused can't keep the window closed for everyone sharing the key. Without the
 * option nothing changes (checkout's card-testing limit still counts every try). The database is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let rows: { id: number; bucket: string; key: string }[] = [];
let next = 1;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (added: { bucket: string; key: string }[]) => ({
        select: async () => {
          const made = added.map((r) => ({ id: next++, ...r }));
          rows.push(...made);
          return { data: made.map((r) => ({ id: r.id })), error: null };
        },
      }),
      select: () => {
        const f: Record<string, string> = {};
        const q = {
          eq: (c: string, v: string) => ((f[c] = v), q),
          gte: async () => ({ count: rows.filter((r) => r.bucket === f.bucket && r.key === f.key).length, error: null }),
        };
        return q;
      },
      delete: () => ({
        in: async (_c: string, ids: number[]) => ((rows = rows.filter((r) => !ids.includes(r.id))), { error: null }),
        lt: async () => ({ error: null }),
      }),
    }),
  }),
}));

const { hitRateLimit } = await import("@/lib/rate-limit");

beforeEach(() => {
  rows = [];
  next = 1;
});

describe("forgetting refused attempts", () => {
  it("with the option, the refused attempt is removed and the count stays at the limit", async () => {
    expect(await hitRateLimit("b", ["k"], 2, 60, { forgetRefused: true })).toBe(false);
    expect(await hitRateLimit("b", ["k"], 2, 60, { forgetRefused: true })).toBe(false);
    for (let i = 0; i < 5; i++) expect(await hitRateLimit("b", ["k"], 2, 60, { forgetRefused: true })).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("without it, every attempt still counts, as on checkout", async () => {
    for (let i = 0; i < 5; i++) await hitRateLimit("b", ["k"], 2, 60);
    expect(rows).toHaveLength(5);
  });
});
