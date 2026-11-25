import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let claims: Record<string, unknown> | null;
let liveUser: { id: string } | null;
const getUser = vi.fn(async () => ({ data: { user: liveUser }, error: null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }), getUser } }),
}));

const limitCalls: { bucket: string; keys: string[]; limit: number; minutes: number }[] = [];
let limitBehaviour: "ok" | "over" | "throws";
let overBucket: string | null;
vi.mock("@/lib/rate-limit", () => ({
  ipKeys: (ip: string) => (ip && ip !== "unknown" ? ["ip#test"] : []),
  hitRateLimit: async (bucket: string, keys: string[], limit: number, minutes: number) => {
    limitCalls.push({ bucket, keys, limit, minutes });
    if (limitBehaviour === "throws") throw new Error("limits down");
    return limitBehaviour === "over" && (overBucket === null || overBucket === bucket);
  },
}));

const deleteOwnAccount = vi.fn(async (_a: unknown, _c: unknown) => ({ status: 200, body: { ok: true, message: "done" } as unknown }));
const deletePreflight = vi.fn(async (_a: unknown) => ({ status: 200, body: { ok: true, signInAgain: false } as unknown }));
vi.mock("@/lib/privacy/self-delete", () => ({ deleteOwnAccount: (a: unknown, c: unknown) => deleteOwnAccount(a, c), deletePreflight: (a: unknown) => deletePreflight(a) }));

const { GET, POST } = await import("@/app/api/app/delete-account/route");

const NOW_S = Math.floor(Date.now() / 1000);
const call = (method: "GET" | "POST", { token = "tok", body }: { token?: string | null; body?: unknown } = {}) =>
  new Request("https://x.test/api/app/delete-account", {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }) as unknown as import("next/server").NextRequest;

beforeEach(() => {
  claims = { sub: "u1", email: "a@example.com", role: "authenticated", amr: [{ method: "otp", timestamp: NOW_S - 30 }] };
  liveUser = { id: "u1" };
  limitCalls.length = 0;
  limitBehaviour = "ok";
  overBucket = null;
  deleteOwnAccount.mockClear();
  deletePreflight.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/app/delete-account", () => {
  it("needs a signed-in person: no token, a bad token, or an account that no longer exists is refused and nothing runs", async () => {
    expect((await POST(call("POST", { token: null, body: { confirm: "DELETE" } }))).status).toBe(401);
    claims = null;
    expect((await POST(call("POST", { body: { confirm: "DELETE" } }))).status).toBe(401);
    claims = { sub: "u1", email: "a@example.com", role: "authenticated", amr: [{ method: "otp", timestamp: NOW_S }] };
    liveUser = null;
    expect((await POST(call("POST", { body: { confirm: "DELETE" } }))).status).toBe(401);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("refuses a password session, as everywhere", async () => {
    claims = { ...claims, amr: [{ method: "password", timestamp: NOW_S }] };
    const r = await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(r.status).toBe(401);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
    expect(limitCalls).toEqual([]);
  });

  it("asks Supabase that the session is still live (a signed-out token is refused)", async () => {
    await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(getUser).toHaveBeenCalledWith("tok");
  });

  it("passes on who they are, when they last signed in (from the token), and what they typed", async () => {
    const r = await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    expect(deleteOwnAccount).toHaveBeenCalledWith({ userId: "u1", email: "a@example.com", signedInAt: NOW_S - 30 }, "DELETE");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("a token that gives no sign-in time reaches the check as null (it will ask to sign in again): amr entries without a timestamp, or no amr at all", async () => {
    // Supabase's real shape: an array of { method, timestamp } with unix seconds. Without a timestamp it is not recent.
    for (const amr of [[{ method: "otp" }], [{ method: "otp", timestamp: undefined }], undefined, []]) {
      claims = { sub: "u1", email: "a@example.com", role: "authenticated", ...(amr === undefined ? {} : { amr }) };
      deleteOwnAccount.mockClear();
      await POST(call("POST", { body: { confirm: "DELETE" } }));
      expect(deleteOwnAccount.mock.calls[0][0]).toMatchObject({ signedInAt: null });
    }
  });

  it("uses the live email from Supabase, not the token's, for the typed confirmation and the reviewer check", async () => {
    liveUser = { id: "u1", email: "new@example.com" } as { id: string };
    await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(deleteOwnAccount.mock.calls[0][0]).toMatchObject({ email: "new@example.com" });
  });

  it("an unreadable body is treated as no confirmation", async () => {
    const req = new Request("https://x.test/api/app/delete-account", { method: "POST", headers: { authorization: "Bearer tok" }, body: "not json" }) as unknown as import("next/server").NextRequest;
    await POST(req);
    expect(deleteOwnAccount.mock.calls[0][1]).toBeUndefined();
  });

  it("only a call with the typed confirmation uses up the person's hourly tries: typos and refused retries do not lock anyone out", async () => {
    for (const confirm of ["nope", "", undefined, 5]) {
      limitCalls.length = 0;
      await POST(call("POST", { body: { confirm } }));
      expect(limitCalls.map((c) => c.bucket), String(confirm)).toEqual(["app-delete-account-ip"]);
    }
    // Even with the person's tries used up, a typo still gets its plain answer (nothing is deleted without the words).
    limitBehaviour = "over";
    overBucket = "app-delete-account";
    deleteOwnAccount.mockClear();
    expect((await POST(call("POST", { body: { confirm: "nope" } }))).status).toBe(200);
    expect(deleteOwnAccount).toHaveBeenCalled();
    // The email also counts as the typed confirmation, in any case.
    limitCalls.length = 0;
    limitBehaviour = "ok";
    await POST(call("POST", { body: { confirm: " A@Example.com " } }));
    expect(limitCalls.map((c) => c.bucket)).toEqual(["app-delete-account-ip", "app-delete-account"]);
  });

  it("is rate limited per person and per internet address, and over a limit nothing runs", async () => {
    await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(limitCalls.map((c) => c.bucket)).toEqual(["app-delete-account-ip", "app-delete-account"]);
    expect(limitCalls[1]).toMatchObject({ keys: ["user:u1"], limit: 8, minutes: 60 });
    limitBehaviour = "over";
    overBucket = "app-delete-account";
    deleteOwnAccount.mockClear();
    const r = await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ ok: false, code: "busy" });
    overBucket = "app-delete-account-ip";
    expect((await POST(call("POST", { body: { confirm: "DELETE" } }))).status).toBe(429);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("when the limits cannot be checked, nothing is deleted", async () => {
    limitBehaviour = "throws";
    const r = await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(r.status).toBe(503);
    expect((await r.json()).message).toMatch(/your account is still there/i);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("passes the refusal on as the check gave it", async () => {
    deleteOwnAccount.mockResolvedValueOnce({ status: 409, body: { ok: false, code: "manager", message: "m" } });
    const r = await POST(call("POST", { body: { confirm: "DELETE" } }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ ok: false, code: "manager", message: "m" });
  });
});

describe("GET /api/app/delete-account (the screen's check)", () => {
  it("answers for the signed-in person and never uses up their deletion tries", async () => {
    const r = await GET(call("GET"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, signInAgain: false });
    expect(deletePreflight).toHaveBeenCalledWith({ userId: "u1", email: "a@example.com", signedInAt: NOW_S - 30 });
    expect(limitCalls.map((c) => c.bucket)).toEqual(["app-delete-account-ip"]);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("refuses without sign-in or with a password session", async () => {
    expect((await GET(call("GET", { token: null }))).status).toBe(401);
    claims = { ...claims, amr: [{ method: "password" }] };
    expect((await GET(call("GET"))).status).toBe(401);
    expect(deletePreflight).not.toHaveBeenCalled();
  });
});
