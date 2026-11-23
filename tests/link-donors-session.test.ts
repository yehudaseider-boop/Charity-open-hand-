/**
 * Guest gifts join an account only for a session started with an emailed link or code and a confirmed email
 * (security review 23/11/2026): never for a password session, whatever path the sign-in came through.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const linked: { p_user: string; p_email: string }[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: async (_fn: string, args: { p_user: string; p_email: string }) => (linked.push(args), { data: 1, error: null }) }),
}));

type Session = { amr: { method: string }[]; sub?: string; user: { id: string; email: string | null; email_confirmed_at: string | null } | null; exchangeFails?: boolean };
let session: Session;
const fakeClient = () => ({
  auth: {
    exchangeCodeForSession: async () => ({ error: session.exchangeFails ? new Error("bad code") : null }),
    getClaims: async () => ({ data: { claims: { sub: session.sub ?? session.user?.id, amr: session.amr } } }),
    getUser: async () => ({ data: { user: session.user } }),
  },
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));

const { linkDonorsForSession, signedInByEmail } = await import("@/lib/donors/link");
const { GET } = await import("@/app/auth/callback/route");

const person = { id: "u1", email: "Donor@Example.com", email_confirmed_at: "2026-11-23T08:00:00Z" };
beforeEach(() => {
  linked.length = 0;
  session = { amr: [{ method: "otp" }], user: person };
});

describe("signedInByEmail", () => {
  it("accepts an emailed code or link, and refuses a password, none, or anything else", () => {
    expect(signedInByEmail([{ method: "otp" }])).toBe(true);
    expect(signedInByEmail([{ method: "magiclink" }])).toBe(true);
    expect(signedInByEmail([{ method: "email/signup" }])).toBe(true);
    expect(signedInByEmail([{ method: "password" }])).toBe(false);
    expect(signedInByEmail([{ method: "otp" }, { method: "password" }])).toBe(false);
    expect(signedInByEmail([{ method: "oauth" }])).toBe(false);
    expect(signedInByEmail([])).toBe(false);
    expect(signedInByEmail(undefined)).toBe(false);
    expect(signedInByEmail("otp")).toBe(false);
  });
});

describe("linkDonorsForSession", () => {
  const client = () => fakeClient() as never;

  it("links an emailed sign-in with a confirmed email", async () => {
    expect(await linkDonorsForSession(client())).toBe(1);
    expect(linked).toEqual([{ p_user: "u1", p_email: "Donor@Example.com" }]);
  });

  it("never links a password session, an unconfirmed email, a token for someone else, or no one", async () => {
    session.amr = [{ method: "password" }];
    expect(await linkDonorsForSession(client())).toBe(0);
    session = { amr: [{ method: "otp" }], user: { ...person, email_confirmed_at: null } };
    expect(await linkDonorsForSession(client())).toBe(0);
    session = { amr: [{ method: "otp" }], user: person, sub: "u2" };
    expect(await linkDonorsForSession(client())).toBe(0);
    session = { amr: [{ method: "otp" }], user: null };
    expect(await linkDonorsForSession(client())).toBe(0);
    expect(linked).toEqual([]);
  });

  it("with onlyEmail, links only when the account's email is the gift's (any case or spaces)", async () => {
    expect(await linkDonorsForSession(client(), { onlyEmail: "someone@else.test" })).toBe(0);
    expect(await linkDonorsForSession(client(), { onlyEmail: " donor@example.COM " })).toBe(1);
  });
});

describe("the emailed link's landing page", () => {
  const land = () => GET(new NextRequest("https://givezy.test/auth/callback?code=abc&next=/account"));

  it("links an emailed-link sign-in and goes on", async () => {
    const res = await land();
    expect(res.headers.get("location")).toMatch(/\/account$/);
    expect(linked).toHaveLength(1);
  });

  it("signs a password session in as before but links nothing", async () => {
    session.amr = [{ method: "password" }];
    const res = await land();
    expect(res.headers.get("location")).toMatch(/\/account$/);
    expect(linked).toEqual([]);
  });

  it("a bad code goes back to Sign in and links nothing", async () => {
    session.exchangeFails = true;
    const res = await land();
    expect(res.headers.get("location")).toMatch(/\/login\?error=link$/);
    expect(linked).toEqual([]);
  });
});
