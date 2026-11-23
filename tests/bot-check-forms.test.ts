/**
 * The bot check on each protected website form (23/11/2026): with the check on, each refuses without a valid token
 * and sends nothing (no email, no gift started, no request saved); with it off, each works exactly as before.
 * Sign-in and the fresh link wait when Cloudflare can't be reached; giving and requests go on. The phone app's
 * routes (/api/app/*) are not protected: the app can't show the check yet.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => "198.51.100.9" }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("@/lib/rate-limit", () => ({
  hashedKey: (kind: string, v: string) => `${kind}#${v}`,
  ipKeys: (a: string) => (a ? [`ip#${a}`] : []),
  hitRateLimit: async () => false,
  takeAttempt: async () => ({ limited: false, ids: [] }),
  forgetAttempts: async () => {},
}));
const sentTo: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp: async ({ email }: { email: string }) => (sentTo.push(email), { error: null }) } }),
}));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => {} }));
const started: unknown[] = [];
vi.mock("@/lib/donations/checkout", () => ({ startDonation: async (a: unknown) => (started.push(a), { ok: true, redirectUrl: "https://pay.example/x" }) }));
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => ({ receiptsAvailable: false }) }));
vi.mock("@/lib/auth", () => ({ getViewer: async () => null }));
const blocked: string[] = [];
vi.mock("@/lib/donations/giving-guard", () => ({ recordBlocked: async (r: string) => void blocked.push(r) }));
const freshAsked: unknown[] = [];
vi.mock("@/lib/donations/fresh-link", () => ({ requestFreshConfirmationLink: async (a: unknown) => (freshAsked.push(a), { ok: true, message: "sent" }) }));
const saved: unknown[] = [];
vi.mock("@/lib/charity-requests-store", () => ({ saveCharityRequest: async (r: unknown) => (saved.push(r), { ok: true, message: "Thank you." }) }));

const { sendLoginLink } = await import("@/app/login/actions");
const { submitDonation } = await import("@/app/c/[slug]/donate/actions");
const { emailFreshLink } = await import("@/app/donate/return/actions");
const { requestCharity } = await import("@/app/charities/request/actions");
const { signInMessages } = await import("@/lib/sign-in");

const FIELD = "cf-turnstile-response";
type Answer = "pass" | "refuse" | "down" | "other-form";
let answer: Answer = "pass";
const asked: URLSearchParams[] = [];
const fakeCloudflare = vi.fn(async (_url: string, init: RequestInit) => {
  const body = init.body as URLSearchParams;
  asked.push(body);
  if (answer === "down") throw new TypeError("fetch failed");
  if (answer === "refuse") return Response.json({ success: false, "error-codes": ["invalid-input-response"] });
  // The action a real token would carry: the form it was earned on (the test says which with the token's text).
  const action = answer === "other-form" ? "some-other-form" : String(body.get("response")).split(":")[0];
  return Response.json({ success: true, hostname: "test.givezy.co.za", action, "error-codes": [] });
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
async function whereTo(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("no redirect");
}
const turnOn = () => {
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "0xFAKE-SITE-KEY";
  process.env.TURNSTILE_SECRET_KEY = "FAKE-SECRET-NEVER-REAL";
};

beforeEach(() => {
  answer = "pass";
  for (const a of [sentTo, started, blocked, freshAsked, saved, asked]) a.length = 0;
  process.env.SITE_URL = "https://test.givezy.co.za";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.stubGlobal("fetch", fakeCloudflare);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
});

const askLink = (extra: Record<string, string> = {}) => whereTo(sendLoginLink(form({ email: "dana@example.com", next: "/account", ...extra })));
// Enough time on the form for the quiet check that was there before; an empty gift fails the field checks (proof
// that the bot check let it through to them).
const give = (extra: Record<string, string> = {}) => submitDonation("hillside", 25000, 0, false, 25000, false, undefined, { ok: false }, form({ form_open_ms: "60000", ...extra }));

describe("sign-in email (fails closed)", () => {
  it("off: sends as before, and never asks Cloudflare", async () => {
    expect(await askLink()).toMatch(/^\/login\?sent=1/);
    expect(sentTo).toEqual(["dana@example.com"]);
    expect(fakeCloudflare).not.toHaveBeenCalled();
  });

  it("on: no token, no email, and the email typed comes back", async () => {
    turnOn();
    const url = new URL(await askLink(), "https://x.test");
    expect(url.searchParams.get("error")).toBe("check");
    expect(url.searchParams.get("email")).toBe("dana@example.com");
    expect(sentTo).toEqual([]);
  });

  it("on: a refused token, or one from another form, sends nothing", async () => {
    turnOn();
    answer = "refuse";
    expect(await askLink({ [FIELD]: "sign-in:tok" })).toContain("error=check");
    answer = "other-form";
    expect(await askLink({ [FIELD]: "sign-in:tok" })).toContain("error=check");
    expect(sentTo).toEqual([]);
  });

  it("on: a good token sends, and the visitor's address goes to Cloudflare with it", async () => {
    turnOn();
    expect(await askLink({ [FIELD]: "sign-in:tok" })).toMatch(/sent=1/);
    expect(sentTo).toEqual(["dana@example.com"]);
    expect(asked[0].get("remoteip")).toBe("198.51.100.9");
  });

  it("on: Cloudflare unreachable sends nothing and says to try again in a minute", async () => {
    turnOn();
    answer = "down";
    expect(await askLink({ [FIELD]: "sign-in:tok" })).toContain("error=check-down");
    expect(sentTo).toEqual([]);
    expect(signInMessages["check-down"]).toMatch(/^We couldn't check this was you just now\. Nothing was sent\. Please try again in a minute\./);
  });

  it("the apply page's form goes back to the apply page with both fields", async () => {
    turnOn();
    const url = new URL(await askLink({ apply_name: "Soup Kitchen", next: "/apply" }), "https://x.test");
    expect(url.pathname).toBe("/apply");
    expect(url.searchParams.get("error")).toBe("check");
    expect(url.searchParams.get("name")).toBe("Soup Kitchen");
  });
});

describe("giving (fails open when Cloudflare is down)", () => {
  it("off: goes on to the field checks as before", async () => {
    const r = await give();
    expect(r.fieldErrors).toBeTruthy();
    expect(fakeCloudflare).not.toHaveBeenCalled();
  });

  it("on: no token starts nothing, says nothing was charged, and is counted as blocked", async () => {
    turnOn();
    const r = await give();
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/nothing was charged/i);
    expect(r.message).toMatch(/What you typed is still here/);
    expect(r.failedToStart).toBe(true);
    expect(r.fieldErrors).toBeUndefined();
    expect(started).toEqual([]);
    expect(blocked).toEqual(["bot"]);
  });

  it("on: a token from the sign-in form can't start a gift", async () => {
    turnOn();
    const r = await give({ [FIELD]: "sign-in:tok" });
    expect(r.message).toMatch(/We couldn't check this was you/);
    expect(started).toEqual([]);
  });

  it("on: a good token goes on to the field checks", async () => {
    turnOn();
    const r = await give({ [FIELD]: "give:tok" });
    expect(r.fieldErrors).toBeTruthy();
  });

  it("on: Cloudflare unreachable lets the gift go on to the other checks", async () => {
    turnOn();
    answer = "down";
    const r = await give({ [FIELD]: "give:tok" });
    expect(r.fieldErrors).toBeTruthy();
    expect(blocked).toEqual([]);
  });
});

describe("Email me a fresh link (fails closed)", () => {
  const ask = (extra: Record<string, string> = {}) => emailFreshLink({ ok: false }, form({ reference: "r", t: "t", ...extra }));

  it("off: asks as before", async () => {
    expect(await ask()).toEqual({ ok: true, message: "sent" });
    expect(freshAsked).toHaveLength(1);
  });

  it("on: no token, a refused one, or Cloudflare unreachable send nothing", async () => {
    turnOn();
    expect((await ask()).ok).toBe(false);
    answer = "refuse";
    expect((await ask({ [FIELD]: "fresh-link:tok" })).ok).toBe(false);
    answer = "down";
    const down = await ask({ [FIELD]: "fresh-link:tok" });
    expect(down).toMatchObject({ ok: false, message: expect.stringMatching(/try again in a minute/) });
    expect(freshAsked).toEqual([]);
  });

  it("on: a good token asks", async () => {
    turnOn();
    expect((await ask({ [FIELD]: "fresh-link:tok" })).ok).toBe(true);
    expect(freshAsked).toHaveLength(1);
  });
});

describe("Request a charity (fails open when Cloudflare is down)", () => {
  const ask = (extra: Record<string, string> = {}) => requestCharity({ ok: false }, form({ name: "Soup Kitchen", ...extra }));

  it("off: saves as before", async () => {
    expect((await ask()).ok).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it("on: no token or a refused one saves nothing, and what was typed stays (the form keeps it)", async () => {
    turnOn();
    const r = await ask();
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/Nothing was sent\. What you typed is still here/) });
    answer = "refuse";
    expect((await ask({ [FIELD]: "charity-request:tok" })).ok).toBe(false);
    expect(saved).toEqual([]);
  });

  it("on: a good token, or Cloudflare unreachable, saves", async () => {
    turnOn();
    expect((await ask({ [FIELD]: "charity-request:tok" })).ok).toBe(true);
    answer = "down";
    expect((await ask({ [FIELD]: "charity-request:tok" })).ok).toBe(true);
    expect(saved).toHaveLength(2);
  });
});

describe("where the check is, and isn't", () => {
  it("every website form that sends a sign-in email shows it", () => {
    for (const f of ["src/app/login/page.tsx", "src/app/apply/page.tsx"]) expect(readFileSync(f, "utf8"), f).toMatch(/<BotCheck [^>]*action="sign-in"[^>]*guardForm/);
  });

  it("the phone app's routes are left on their own limits (the app can't show the check yet)", () => {
    for (const f of ["src/app/api/app/checkout/route.ts", "src/app/api/app/charity-request/route.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/verifyBotCheck/);
  });
});
