/**
 * POST /api/app/news-opt-outs (24/11/2026): the phone app asks our server which charities' news a signed-in donor
 * turned off. Only for a donor signed in with an emailed code (a password session is refused), rate limited, and a
 * failure is a plain 503 (the app then shows no news, never news someone said no to). Only charity ids go back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ limited: false as boolean | "error", fails: false, asked: [] as string[], limits: [] as string[][] }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (_bucket: string, keys: string[]) => {
    state.limits.push(keys);
    if (state.limited === "error") throw new Error("limiter down");
    return state.limited;
  },
}));
vi.mock("@/lib/charity/news-opt-outs", () => ({
  newsOptOutsFor: async (userId: string) => {
    state.asked.push(userId);
    if (state.fails) throw new Error("database down");
    return ["c1", "c2"];
  },
}));
// The token's claims, as Supabase would check them: one code sign-in, one password sign-in.
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
  }),
}));

const { POST } = await import("@/app/api/app/news-opt-outs/route");
const call = (token?: string) => POST(new NextRequest("https://g.test/api/app/news-opt-outs", { method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {} }));

beforeEach(() => {
  state.limited = false;
  state.fails = false;
  state.asked = [];
  state.limits = [];
});

describe("POST /api/app/news-opt-outs", () => {
  it("gives a code-signed-in donor their charity ids only, never cached", async () => {
    const res = await call("code");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, charityIds: ["c1", "c2"] });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(state.asked).toEqual(["u1"]);
    expect(state.limits).toEqual([["user:u1"]]);
  });

  it("refuses a password session, a bad token and no token with 401, and looks nothing up", async () => {
    for (const t of ["password", "nonsense", undefined]) {
      const res = await call(t);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, message: "Please sign in again." });
    }
    expect(state.asked).toEqual([]);
  });

  it("is rate limited with 429, and a limiter that fails counts as limited", async () => {
    state.limited = true;
    expect((await call("code")).status).toBe(429);
    state.limited = "error";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("code");
    err.mockRestore();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, message: "Please wait a moment, then try again." });
    expect(state.asked).toEqual([]);
  });

  it("a failed lookup is a plain 503, with no ids", async () => {
    state.fails = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("code");
    err.mockRestore();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, message: "We couldn't check your email choices just now. Please try again." });
  });
});
