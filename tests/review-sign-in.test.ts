/**
 * The app reviewer's fixed code (22/11/2026): off unless both settings are there, only the reviewer's email and code
 * work, a few tries an hour, and never for an account that manages a charity or is a Givezy admin. Supabase is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isReviewSignIn, reviewSignIn } from "@/lib/review-sign-in";

const state = vi.hoisted(() => ({ limited: false, role: "user" as string, charities: 0, userId: "u-review" as string | null, audits: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string }) => void state.audits.push(a.action) }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => state.limited, ipKeys: (ip: string) => [`ip:${ip}`] }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: async () => (state.userId ? { data: { user: { id: state.userId }, properties: { hashed_token: "hashed-token-1234567890" } }, error: null } : { data: null, error: { message: "User not found" } }) } },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => (table === "charity_admins" ? Promise.resolve({ count: state.charities, error: null }) : q);
      q.maybeSingle = async () => ({ data: { role: state.role }, error: null });
      return q;
    },
  }),
}));

const { POST } = await import("@/app/api/app/review-sign-in/route");
const ask = (body: unknown) => POST(new Request("https://test.givezy.co.za/api/app/review-sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never);
const EMAIL = "review@givezy.co.za";
const CODE = "48213907";

beforeEach(() => {
  vi.stubEnv("REVIEW_SIGN_IN_EMAIL", EMAIL);
  vi.stubEnv("REVIEW_SIGN_IN_CODE", CODE);
  Object.assign(state, { limited: false, role: "user", charities: 0, userId: "u-review", audits: [] });
});

describe("the reviewer's settings", () => {
  it("are off unless both are there, with a code of at least 8 characters", () => {
    expect(reviewSignIn({})).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: EMAIL })).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: EMAIL, REVIEW_SIGN_IN_CODE: "1234" })).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: " Review@Givezy.co.za ", REVIEW_SIGN_IN_CODE: CODE })).toEqual({ email: EMAIL, code: CODE });
  });
  it("match only that email and code", () => {
    const s = reviewSignIn({ REVIEW_SIGN_IN_EMAIL: EMAIL, REVIEW_SIGN_IN_CODE: CODE });
    expect(isReviewSignIn(s, "REVIEW@givezy.co.za", CODE)).toBe(true);
    expect(isReviewSignIn(s, EMAIL, "48213908")).toBe(false);
    expect(isReviewSignIn(s, "someone@x.co", CODE)).toBe(false);
    expect(isReviewSignIn(null, EMAIL, CODE)).toBe(false);
  });
});

describe("the reviewer's sign-in", () => {
  it("is not there while switched off", async () => {
    vi.stubEnv("REVIEW_SIGN_IN_CODE", "");
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(404);
  });
  it("gives the reviewer a one-time sign-in token, and records it", async () => {
    const res = await ask({ email: EMAIL, code: CODE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tokenHash: "hashed-token-1234567890" });
    expect(state.audits).toEqual(["auth.review_sign_in"]);
  });
  it("refuses a wrong code, and anyone else's email, the same way", async () => {
    const wrong = await ask({ email: EMAIL, code: "00000000" });
    const other = await ask({ email: "someone@x.co", code: CODE });
    expect(wrong.status).toBe(401);
    expect(other.status).toBe(401);
    expect(await wrong.json()).toEqual(await other.json());
  });
  it("stops after a few tries", async () => {
    state.limited = true;
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(429);
  });
  it("never signs in an account that manages a charity or is a Givezy admin", async () => {
    state.charities = 1;
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(401);
    state.charities = 0;
    state.role = "platform_admin";
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(401);
    expect(state.audits).toEqual([]);
  });
  it("asks for Send code first when the account doesn't exist yet", async () => {
    state.userId = null;
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(409);
  });
});
