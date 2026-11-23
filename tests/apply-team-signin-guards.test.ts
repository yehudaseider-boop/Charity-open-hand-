/**
 * Review 23/11/2026, area C:
 * - starting an application is one step in the database (no charity left without an owner);
 * - people are added to a charity's team only once it is approved;
 * - sign-in refuses (plainly) when no limit key can be made, instead of running without limits.
 * The database, email and sign-in provider are stand-ins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => "198.51.100.1" }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/bot-check", () => ({ verifyBotCheck: async () => ({ ok: true }) }));
vi.mock("@/lib/charity/invites", () => ({ claimInvite: async () => false }));

const sentEmails = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp: async ({ email }: { email: string }) => (sentEmails.push(email), { error: null }), verifyOtp: async () => ({ data: { user: null }, error: new Error("bad") }) } }),
}));
const written: string[] = [];
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let rpcResults: { data: unknown; error: { code?: string; message: string } | null }[] = [];
let charityStatus = "pending_review";
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return rpcResults.shift() ?? { data: null, error: null };
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.insert = () => (written.push(`insert ${table}`), q);
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.delete = () => (written.push(`delete ${table}`), q);
      q.maybeSingle = async () => ({ data: table === "charities" ? { status: charityStatus, id: "33333333-3333-3333-3333-333333333333" } : null, error: null });
      q.single = q.maybeSingle;
      return q;
    },
  }),
}));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "owner@meals.test" }) }));
vi.mock("@/lib/rate-limit", async (orig) => ({ ...(await orig<object>()), hitRateLimit: async () => false }));

const { startApplication } = await import("@/app/apply/actions");

beforeEach(() => {
  written.length = 0;
  rpcCalls = [];
  rpcResults = [];
  charityStatus = "pending_review";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
});
afterEach(() => vi.unstubAllEnvs());

async function whereTo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { url?: string }).url ?? String((e as Error).message);
  }
  throw new Error("no redirect");
}

describe("starting an application", () => {
  const form = () => {
    const f = new FormData();
    f.set("name_en", "Meals Fund");
    return f;
  };

  it("makes the charity, its owner and its private row in one database step, never in separate writes", async () => {
    rpcResults = [{ data: "22222222-2222-2222-2222-222222222222", error: null }];
    const url = await whereTo(startApplication({ ok: false }, form()));
    expect(url).toBe("/charity-admin/22222222-2222-2222-2222-222222222222/application");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({ name: "start_charity_application", args: { p_name: "Meals Fund", p_user_id: "u1", p_email: "owner@meals.test" } });
    expect(written).toEqual([]);
  });

  it("tries again with another web address on a clash, and a real failure leaves nothing half made", async () => {
    rpcResults = [{ data: null, error: { code: "23505", message: "duplicate" } }, { data: "22222222-2222-2222-2222-222222222222", error: null }];
    await whereTo(startApplication({ ok: false }, form()));
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[1].args.p_slug).not.toBe(rpcCalls[0].args.p_slug);

    rpcCalls = [];
    rpcResults = [{ data: null, error: { code: "08006", message: "connection lost" } }];
    await expect(startApplication({ ok: false }, form())).rejects.toMatchObject({ message: "connection lost" });
    expect(written).toEqual([]);
  });
});

describe("starting an application before database change 000009 is in", () => {
  it("makes the three rows one by one, as before, and opens the application", async () => {
    rpcResults = [{ data: null, error: { code: "PGRST202", message: "Could not find the function public.start_charity_application" } }];
    const f = new FormData();
    f.set("name_en", "Meals Fund");
    const url = await whereTo(startApplication({ ok: false }, f));
    expect(url).toBe("/charity-admin/33333333-3333-3333-3333-333333333333/application");
    expect(written).toEqual(["insert charities", "insert charity_admins", "insert charity_private"]);
  });
});

describe("adding people to a team", () => {
  const add = async () => {
    vi.resetModules();
    vi.doMock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status: charityStatus } }) }));
    vi.doMock("@/lib/charity/team", async (orig) => ({ ...(await orig<object>()), isOwner: async () => true }));
    vi.doMock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "done1" }));
    const { addTeamMember } = await import("@/app/charity-admin/[id]/team/actions");
    const f = new FormData();
    f.set("email", "sam@meals.test");
    f.set("role", "admin");
    return addTeamMember("c1", { ok: false }, f);
  };

  it("refuses while the charity is still being reviewed, says why, and creates no sign-in", async () => {
    charityStatus = "pending_review";
    const r = await add();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/once Givezy has approved your charity/);
    expect(r.message).toMatch(/Nothing was changed/);
    expect(written).toEqual([]);
  });

  it("refuses a draft the same way", async () => {
    charityStatus = "draft";
    expect((await add()).message).toMatch(/once Givezy has approved your charity/);
  });
});

describe("sign-in without a limit key", () => {
  const live = () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENCRYPTION_KEY", "");
  };
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("sendLoginLink refuses with a plain message and sends no email", async () => {
    live();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    const { sendLoginLink } = await import("@/app/login/actions");
    const url = await whereTo(sendLoginLink(form({ email: "dana@example.com", next: "/account" })));
    expect(url).toContain("error=unavailable");
    expect(sentEmails).toEqual([]);
    const { signInMessages } = await import("@/lib/sign-in");
    expect(signInMessages.unavailable).toMatch(/no email was sent/);
  });

  it("verifyLoginCode refuses too, without checking the code", async () => {
    live();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    const { verifyLoginCode } = await import("@/app/login/actions");
    const url = await whereTo(verifyLoginCode(form({ email: "dana@example.com", code: "123456", next: "/account" })));
    expect(url).toContain("error=unavailable");
  });
});
