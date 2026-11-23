/**
 * The app reviewer's fixed code (22/11/2026): off unless both settings are there, only the reviewer's email and code
 * work, a few tries an hour, and only ever an empty donor account (review 22/11/2026: never an admin, a charity's
 * team, or an account with gifts or an ID number; checked before any token is made; a failed check refuses).
 * Supabase is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isReviewSignIn, reviewSignIn, reviewTokenType } from "@/lib/review-sign-in";

type Fail = "profile" | "admins" | "donors" | "gifts" | "limits" | null;
const state = vi.hoisted(() => ({
  limitedIp: false,
  wrongCodesFull: false,
  role: "user" as string,
  profileId: "u-review" as string | null,
  linkUserId: "u-review",
  verificationType: "magiclink",
  charities: 0,
  donors: [] as { id: string; id_number_encrypted: string | null }[],
  gifts: 0,
  fail: null as Fail,
  audits: [] as string[],
  wrongCounted: 0,
  ipCounted: 0,
  links: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string }) => void state.audits.push(a.action) }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (bucket: string) => {
    if (state.fail === "limits") throw new Error("db down");
    if (bucket === "review-sign-in-wrong") state.wrongCounted += 1;
    if (bucket === "review-sign-in-ip") state.ipCounted += 1;
    return bucket === "review-sign-in-ip" ? state.limitedIp : false;
  },
  rateLimitReached: async () => state.wrongCodesFull,
  ipKeys: (ip: string) => [`ip:${ip}`],
}));
const err = { message: "timeout" };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        generateLink: async ({ email }: { email: string }) => {
          state.links.push(email);
          return { data: { user: { id: state.linkUserId }, properties: { hashed_token: "hashed-token-1234567890", verification_type: state.verificationType } }, error: null };
        },
      },
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.maybeSingle = async () => (state.fail === "profile" ? { data: null, error: err } : { data: state.profileId ? { id: state.profileId, role: state.role } : null, error: null });
      q.eq = () => {
        if (table === "charity_admins") return Promise.resolve(state.fail === "admins" ? { count: null, error: err } : { count: state.charities, error: null });
        if (table === "donors") return Promise.resolve(state.fail === "donors" ? { data: null, error: err } : { data: state.donors, error: null });
        return q;
      };
      q.in = () => Promise.resolve(state.fail === "gifts" ? { count: null, error: err } : { count: state.gifts, error: null });
      return q;
    },
  }),
}));

const { POST } = await import("@/app/api/app/review-sign-in/route");
const send = (body: string) => POST(new Request("https://test.givezy.co.za/api/app/review-sign-in", { method: "POST", headers: { "content-type": "application/json" }, body }) as never);
const ask = (body: unknown) => send(JSON.stringify(body));
const EMAIL = "review@givezy.co.za";
const CODE = "48213907";

beforeEach(() => {
  vi.stubEnv("REVIEW_SIGN_IN_EMAIL", EMAIL);
  vi.stubEnv("REVIEW_SIGN_IN_CODE", CODE);
  Object.assign(state, { limitedIp: false, wrongCodesFull: false, role: "user", profileId: "u-review", linkUserId: "u-review", verificationType: "magiclink", charities: 0, donors: [], gifts: 0, fail: null, audits: [], wrongCounted: 0, ipCounted: 0, links: [] });
});

describe("the reviewer's settings", () => {
  it("are off unless both are there, with a code of at least 8 characters", () => {
    expect(reviewSignIn({})).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: EMAIL })).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_CODE: CODE })).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: "  ", REVIEW_SIGN_IN_CODE: CODE })).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: EMAIL, REVIEW_SIGN_IN_CODE: "1234" })).toBeNull();
    expect(reviewSignIn({ REVIEW_SIGN_IN_EMAIL: " Review@Givezy.co.za ", REVIEW_SIGN_IN_CODE: CODE })).toEqual({ email: EMAIL, code: CODE });
  });
  it("match only that email and code", () => {
    const s = reviewSignIn({ REVIEW_SIGN_IN_EMAIL: EMAIL, REVIEW_SIGN_IN_CODE: CODE });
    expect(isReviewSignIn(s, "REVIEW@givezy.co.za", CODE)).toBe(true);
    expect(isReviewSignIn(s, EMAIL, "48213908")).toBe(false);
    expect(isReviewSignIn(s, "someone@x.co", CODE)).toBe(false);
    expect(isReviewSignIn(s, "review@givezy.co.za​", CODE)).toBe(false);
    expect(isReviewSignIn(null, EMAIL, CODE)).toBe(false);
  });
  it("pass back a sign-up token as one, anything else as a sign-in token", () => {
    expect(reviewTokenType("signup")).toBe("signup");
    expect(reviewTokenType("magiclink")).toBe("magiclink");
    expect(reviewTokenType(undefined)).toBe("magiclink");
  });
});

describe("the reviewer's sign-in", () => {
  it("is not there while switched off, and that answer isn't kept", async () => {
    vi.stubEnv("REVIEW_SIGN_IN_CODE", "");
    const res = await ask({ email: EMAIL, code: CODE });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("gives the reviewer a one-time token for their own account only, and records it", async () => {
    const res = await ask({ email: " Review@Givezy.co.za ", code: CODE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tokenHash: "hashed-token-1234567890", type: "magiclink" });
    expect(state.links).toEqual([EMAIL]);
    expect(state.audits).toEqual(["auth.review_sign_in"]);
  });
  it("says when the token is a new account's sign-up one", async () => {
    state.verificationType = "signup";
    expect(await (await ask({ email: EMAIL, code: CODE })).json()).toMatchObject({ ok: true, type: "signup" });
  });
  it("refuses a wrong code, anyone else's email, and a body it can't read, the same way", async () => {
    const wrong = await ask({ email: EMAIL, code: "00000000" });
    const other = await ask({ email: "someone@x.co", code: CODE });
    const junk = await send("not json");
    for (const r of [wrong, other, junk]) expect(r.status).toBe(401);
    expect(await wrong.json()).toEqual(await other.json());
    expect(state.links).toEqual([]);
  });
  it("counts and records only the reviewer's wrong codes in the shared allowance", async () => {
    await ask({ email: EMAIL, code: "00000000" });
    await ask({ email: "someone@x.co", code: "00000000" });
    await ask({ email: EMAIL, code: CODE });
    expect(state.wrongCounted).toBe(1);
    expect(state.audits).toEqual(["auth.review_sign_in_refused", "auth.review_sign_in"]);
  });
  it("stops after a few tries from one address, or too many wrong codes in all, with the plain refusal and no token", async () => {
    state.limitedIp = true;
    const one = await ask({ email: EMAIL, code: CODE });
    expect(one.status).toBe(401);
    expect((await one.json()).message).toMatch(/That code didn't work/);
    state.limitedIp = false;
    state.wrongCodesFull = true;
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(401);
    expect(state.links).toEqual([]);
  });
  it("refuses plainly, not open, when the limits can't be checked", async () => {
    state.fail = "limits";
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(401);
    expect(state.links).toEqual([]);
  });
  it("counts every try per address and answers any email the same way, so the reviewer's email can't be found (23/11/2026)", async () => {
    // Every try from an address counts, whichever email it names.
    await ask({ email: "someone@x.co", code: "00000000" });
    await ask({ email: EMAIL, code: "00000000" });
    await ask({ email: "", code: "" });
    expect(state.ipCounted).toBe(3);
    const plain = JSON.stringify(await (await ask({ email: "someone@x.co", code: "00000000" })).json());
    const sameForAll = async () => {
      const answers = await Promise.all([EMAIL, "someone@x.co", "other@y.co"].map((email) => ask({ email, code: "00000000" })));
      for (const r of answers) expect(r.status).toBe(401);
      const bodies = await Promise.all(answers.map((r) => r.json()));
      // The same plain refusal an ordinary donor's wrong code gets, never "too many tries" or "not available".
      for (const b of bodies) expect(JSON.stringify(b)).toBe(plain);
    };
    // Over the address limit, too many wrong codes in all, or a limit that can't be checked: the same for every email.
    state.limitedIp = true;
    await sameForAll();
    state.limitedIp = false;
    state.wrongCodesFull = true;
    await sameForAll();
    state.wrongCodesFull = false;
    state.fail = "limits";
    await sameForAll();
    expect(state.links).toEqual([]);
  });
  it("asks for Send code first when the account doesn't exist yet, without making one", async () => {
    state.profileId = null;
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(409);
    expect(state.links).toEqual([]);
  });
  it("never signs in a Givezy admin, a charity's team, or an account with gifts or an ID number, and makes no token for them", async () => {
    const cases: Partial<typeof state>[] = [
      { role: "platform_admin" },
      { charities: 1 },
      { donors: [{ id: "d1", id_number_encrypted: null }], gifts: 2 },
      { donors: [{ id: "d1", id_number_encrypted: "enc:xyz" }] },
    ];
    for (const c of cases) {
      Object.assign(state, { role: "user", charities: 0, donors: [], gifts: 0 }, c);
      expect((await ask({ email: EMAIL, code: CODE })).status).toBe(401);
    }
    expect(state.links).toEqual([]);
    expect(state.audits.every((a) => a === "auth.review_sign_in_refused")).toBe(true);
  });
  it("signs in an account that gave nothing yet, even with a donor record", async () => {
    state.donors = [{ id: "d1", id_number_encrypted: null }];
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(200);
  });
  it("refuses, and makes no token, when any of those checks can't be done", async () => {
    for (const fail of ["profile", "admins", "donors", "gifts"] as const) {
      state.fail = fail;
      state.donors = [{ id: "d1", id_number_encrypted: null }];
      expect((await ask({ email: EMAIL, code: CODE })).status).toBe(503);
    }
    expect(state.links).toEqual([]);
  });
  it("refuses when the token comes back for a different account", async () => {
    state.linkUserId = "someone-else";
    expect((await ask({ email: EMAIL, code: CODE })).status).toBe(503);
    expect(state.audits).toEqual([]);
  });
});
