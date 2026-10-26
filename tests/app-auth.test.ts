import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let claims: Record<string, unknown> | null = null;
let liveUser: { id: string } | null = null;
let liveError: Error | null = null;
const getUser = vi.fn(async () => ({ data: { user: liveUser }, error: liveError }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }), getUser } }),
}));

const { appAccount } = await import("@/lib/app-auth");
const req = (token = "tok") => new Request("https://x.test/api/app/checkout", { headers: { authorization: `Bearer ${token}` } });

describe("app sign-in check", () => {
  beforeEach(() => {
    claims = { sub: "u1", email: "a@example.com", role: "authenticated", amr: [{ method: "otp" }] };
    liveUser = { id: "u1" };
    liveError = null;
    getUser.mockClear();
  });

  it("reads who it is from the token for everyday calls, without a second check", async () => {
    expect(await appAccount(req())).toEqual({ userId: "u1", email: "a@example.com" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("for money, also asks Supabase that the session is still live", async () => {
    expect(await appAccount(req(), { forMoney: true })).toEqual({ userId: "u1", email: "a@example.com" });
    expect(getUser).toHaveBeenCalledWith("tok");
  });

  it("for money, refuses a token whose session was signed out or whose account is gone", async () => {
    liveError = new Error("session_not_found");
    liveUser = null;
    expect(await appAccount(req(), { forMoney: true })).toBeNull();
  });

  it("for money, refuses when the live account is someone else", async () => {
    liveUser = { id: "u2" };
    expect(await appAccount(req(), { forMoney: true })).toBeNull();
  });

  it("still refuses password sessions and missing tokens", async () => {
    claims = { ...claims, amr: [{ method: "password" }] };
    expect(await appAccount(req(), { forMoney: true })).toBeNull();
    expect(await appAccount(new Request("https://x.test/"))).toBeNull();
  });
});
