/**
 * Demo mode is security-critical: its one-click sign-in must be impossible to reach on any site that
 * is not the demo. These checks prove every way in refuses when DEMO_MODE is off (or on but unsafe),
 * that demo mode never emails or charges anyone, and that even when on it only signs in accounts the
 * demo data marked as demo accounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// Every database call is recorded. With demo mode off, none may happen at all.
const calls: string[] = [];
let demoUser: { email: string; app_metadata: Record<string, unknown> } | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    calls.push("admin");
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: demoUser ? { id: "user-1", charity_id: "c1" } : null, error: null });
    return {
      from: () => q,
      auth: {
        admin: {
          getUserById: async () => ({ data: { user: demoUser }, error: null }),
          generateLink: async () => (calls.push("generateLink"), { data: { properties: { hashed_token: "hash" } }, error: null }),
        },
      },
    };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    calls.push("session");
    return {
      auth: {
        verifyOtp: async () => (calls.push("verifyOtp"), { error: null }),
        mfa: { listFactors: async () => ({ data: { totp: [{ id: "f1" }] } }), challengeAndVerify: async () => (calls.push("mfa"), { error: null }) },
        signOut: async () => ({ error: null }),
      },
    };
  },
}));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => false, ipKeys: (ip: string) => [`ip:${ip}`] }));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));

const KEYS = ["DEMO_MODE", "PAYMENT_GATEWAY", "PAYSTACK_SECRET_KEY", "EMAIL_TRANSPORT", "RESEND_API_KEY", "VERCEL_ENV", "ALLOW_TEST_GATEWAY", "SITE_URL"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  calls.length = 0;
  demoUser = null;
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const SAFE = { DEMO_MODE: "yes", PAYMENT_GATEWAY: "test" };
function setEnv(env: Record<string, string>) {
  Object.assign(process.env, env);
}

function post(path: string, body: Record<string, string>, origin = "http://localhost") {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

describe("the demo switch", () => {
  it("is off unless DEMO_MODE is exactly yes", async () => {
    const { demoModeOn } = await import("@/lib/demo/mode");
    expect(demoModeOn({})).toBe(false);
    for (const v of ["", "no", "YES", "true", "1", "yes "]) expect(demoModeOn({ DEMO_MODE: v })).toBe(false);
    expect(demoModeOn({ DEMO_MODE: "yes" })).toBe(true);
  });

  it("stays off on a setup that could charge or email someone", async () => {
    const { demoModeOn, demoModeProblems } = await import("@/lib/demo/mode");
    expect(demoModeOn({ DEMO_MODE: "yes", PAYMENT_GATEWAY: "paystack" })).toBe(false);
    expect(demoModeOn({ DEMO_MODE: "yes", PAYSTACK_SECRET_KEY: "sk_live_x" })).toBe(false);
    expect(demoModeOn({ DEMO_MODE: "yes", EMAIL_TRANSPORT: "resend" })).toBe(false);
    expect(demoModeOn({ DEMO_MODE: "yes", RESEND_API_KEY: "re_x" })).toBe(false);
    expect(demoModeProblems({ DEMO_MODE: "yes", PAYMENT_GATEWAY: "paystack", RESEND_API_KEY: "re_x" })).toHaveLength(2);
  });
});

describe("with demo mode off, every way in refuses", () => {
  it("the sign-in route answers not found and touches nothing", async () => {
    const { POST, GET } = await import("@/app/demo/sign-in/route.demo");
    for (const who of ["owner", "admin", "givezy", "donor"]) {
      const res = await POST(post("/demo/sign-in", { who }));
      expect(res.status).toBe(404);
    }
    expect(GET().status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("refuses when DEMO_MODE is on but the setup is unsafe (a real gateway)", async () => {
    setEnv({ DEMO_MODE: "yes", PAYMENT_GATEWAY: "paystack" });
    const { POST } = await import("@/app/demo/sign-in/route.demo");
    expect((await POST(post("/demo/sign-in", { who: "owner" }))).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("the sign-in itself refuses even if called directly", async () => {
    const { signInAsDemoPerson } = await import("@/lib/demo/sign-in");
    expect(await signInAsDemoPerson("owner", "1.2.3.4")).toEqual({ ok: false, status: 404, why: "off" });
    expect(calls).toEqual([]);
  });

  it("the Try the demo page (with its buttons) is not found", async () => {
    const { default: DemoPage } = await import("@/app/demo/page.demo");
    await expect(DemoPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  });

  it("the proxy answers not found for every demo path, and leaves sign-in alone", async () => {
    const { proxy } = await import("@/proxy");
    for (const path of ["/demo", "/demo/", "/demo/sign-in", "/api/jobs/demo-reset"]) {
      const res = await proxy(new NextRequest(`http://localhost${path}`));
      expect(res.status, path).toBe(404);
    }
    const login = await proxy(new NextRequest("http://localhost/login"));
    expect(login.status).toBe(200);
    expect(login.headers.get("location")).toBeNull();
  });

  it("the demo files are left out of the build", async () => {
    vi.resetModules();
    const off = (await import("../next.config")).default;
    expect(off.pageExtensions).toEqual(["tsx", "ts", "jsx", "js"]);
    process.env.DEMO_MODE = "yes";
    vi.resetModules();
    const on = (await import("../next.config")).default;
    expect(on.pageExtensions).toContain("demo.tsx");
    expect(on.pageExtensions).toContain("demo.ts");
  });

  it("the sign-in banner is not shown", async () => {
    const { demoModeOn } = await import("@/lib/demo/mode");
    expect(demoModeOn()).toBe(false);
  });
});

describe("with demo mode on", () => {
  it("only signs in an account this database marked as a demo account", async () => {
    setEnv(SAFE);
    const { signInAsDemoPerson } = await import("@/lib/demo/sign-in");
    // A real database has no such accounts.
    expect(await signInAsDemoPerson("owner", "1.2.3.4")).toMatchObject({ ok: false, why: "not_set_up" });
    // Same email, but not marked as a demo account.
    demoUser = { email: "thandi.owner@givezy-demo.test", app_metadata: {} };
    expect(await signInAsDemoPerson("owner", "1.2.3.4")).toMatchObject({ ok: false, why: "not_set_up" });
    expect(calls).not.toContain("generateLink");
    expect(calls).not.toContain("verifyOtp");
  });

  it("refuses anyone who is not one of the four made-up people", async () => {
    setEnv(SAFE);
    const { signInAsDemoPerson } = await import("@/lib/demo/sign-in");
    for (const who of ["", "root", "admin@nedivlev.test", null, undefined]) {
      expect(await signInAsDemoPerson(who, "1.2.3.4")).toMatchObject({ ok: false, why: "who" });
    }
  });

  it("signs a marked demo admin in with the server-made token and the second step", async () => {
    setEnv(SAFE);
    demoUser = { email: "thandi.owner@givezy-demo.test", app_metadata: { demo: true, demo_totp: "v1.x" } };
    const { signInAsDemoPerson } = await import("@/lib/demo/sign-in");
    expect(await signInAsDemoPerson("owner", "1.2.3.4")).toEqual({ ok: true, next: "/charity-admin/c1" });
    expect(calls).toContain("verifyOtp");
    expect(calls).toContain("mfa");
  });

  it("the route refuses a post from another site", async () => {
    setEnv(SAFE);
    const { POST } = await import("@/app/demo/sign-in/route.demo");
    const res = await POST(post("/demo/sign-in", { who: "donor" }, "https://evil.example"));
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("the proxy sends the email sign-in page to the demo's buttons", async () => {
    setEnv(SAFE);
    const { proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest("http://localhost/login"));
    expect(res.headers.get("location")).toBe("http://localhost/demo");
  });

  it("the emailed sign-in code is refused, so nobody is emailed", async () => {
    setEnv(SAFE);
    const { sendLoginLink, verifyLoginCode } = await import("@/app/login/actions");
    const form = new FormData();
    form.set("email", "someone@example.com");
    await expect(sendLoginLink(form)).rejects.toThrow("REDIRECT:/demo");
    await expect(verifyLoginCode(form)).rejects.toThrow("REDIRECT:/demo");
    expect(calls).toEqual([]);
  });
});

describe("demo mode never emails or charges anyone", () => {
  it("email is never sent while DEMO_MODE is set, whatever the transport says", async () => {
    const { getEmailTransport } = await import("@/lib/email");
    const t = getEmailTransport({ DEMO_MODE: "yes", EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.co.za" });
    expect(t.name).toBe("console");
    expect(await t.send({ to: "someone@example.com", subject: "Hi", text: "Hi" })).toBe("skipped");
  });

  it("refuses a real gateway while DEMO_MODE is set", async () => {
    setEnv({ DEMO_MODE: "yes", PAYMENT_GATEWAY: "paystack" });
    const { getGateway } = await import("@/lib/gateway");
    expect(() => getGateway()).toThrow("Demo mode only runs the test gateway.");
  });

  it("the test gateway on a live (production) deployment needs demo mode on as well", async () => {
    const { getGateway } = await import("@/lib/gateway");
    setEnv({ VERCEL_ENV: "production", PAYMENT_GATEWAY: "test", ALLOW_TEST_GATEWAY: "yes" });
    expect(() => getGateway()).toThrow("never allowed on the live site");
    setEnv({ DEMO_MODE: "yes" });
    expect(getGateway().name).toBe("test");
    delete process.env.ALLOW_TEST_GATEWAY;
    expect(() => getGateway()).toThrow("never allowed on the live site");
  });
});

describe("authenticator codes", () => {
  it("match the RFC 6238 test values", async () => {
    const { totpCode } = await import("@/lib/demo/totp");
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // "12345678901234567890"
    expect(totpCode(secret, new Date(59_000))).toBe("287082");
    expect(totpCode(secret, new Date(1_111_111_109_000))).toBe("081804");
    expect(totpCode(secret, new Date(2_000_000_000_000))).toBe("279037");
  });
});
