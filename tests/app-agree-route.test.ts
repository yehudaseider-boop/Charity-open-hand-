/**
 * POST /api/app/agree (24/11/2026): the phone app's "I agree" to the Terms and Privacy policy is recorded by our server,
 * only for a donor signed in with an emailed code, only for the version the server has, and a second agreement counts as
 * already recorded. Before, the app wrote it to the database itself with any version text.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ limited: false as boolean | "error", insert: null as null | { code?: string; message: string }, rows: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[] }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async () => {
    if (state.limited === "error") throw new Error("limiter down");
    return state.limited;
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: Record<string, unknown>) => void state.audits.push(e) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      getClaims: async (token: string) =>
        token === "code"
          ? { data: { claims: { sub: "u1", email: "donor@x.co", role: "authenticated", amr: [{ method: "otp" }] } }, error: null }
          : token === "password"
            ? { data: { claims: { sub: "u2", email: "pw@x.co", role: "authenticated", amr: [{ method: "password" }] } }, error: null }
            : { data: null, error: { message: "bad token" } },
    },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (state.insert) return { error: state.insert };
        state.rows.push(row);
        return { error: null };
      },
    }),
  }),
}));

const { legalConfig } = await import("@/config/legal");
const { POST } = await import("@/app/api/app/agree/route");
const call = (token: string | undefined, body: unknown) =>
  POST(new NextRequest("https://g.test/api/app/agree", { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

beforeEach(() => {
  state.limited = false;
  state.insert = null;
  state.rows = [];
  state.audits = [];
});

describe("POST /api/app/agree", () => {
  it("records agreement to the server's current version for a code-signed-in donor, and notes it", async () => {
    const res = await call("code", { version: legalConfig.policyVersion });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.rows).toEqual([{ kind: "account", policy_version: legalConfig.policyVersion, user_id: "u1" }]);
    expect(state.audits).toHaveLength(1);
  });

  it("records nothing for a version the server doesn't have, and says to update the app", async () => {
    const res = await call("code", { version: "2099-01-01-made-up" });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/update the app/);
    expect(state.rows).toEqual([]);
  });

  it("refuses a password session, a bad token and no token, and records nothing", async () => {
    for (const t of ["password", "nonsense", undefined]) {
      const res = await call(t, { version: legalConfig.policyVersion });
      expect(res.status).toBe(401);
    }
    expect(state.rows).toEqual([]);
  });

  it("a second agreement to the same version counts as already recorded", async () => {
    state.insert = { code: "23505", message: "duplicate key" };
    const res = await call("code", { version: legalConfig.policyVersion });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rate limited (or the limiter failing) is a 429, and a database failure a 503 that says nothing changed", async () => {
    for (const l of [true, "error"] as const) {
      state.limited = l;
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await call("code", { version: legalConfig.policyVersion })).status).toBe(429);
    }
    state.limited = false;
    state.insert = { code: "08006", message: "connection lost" };
    const res = await call("code", { version: legalConfig.policyVersion });
    expect(res.status).toBe(503);
    expect((await res.json()).message).toMatch(/Nothing has changed/);
  });
});
