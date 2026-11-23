/**
 * Cloudflare Turnstile, the bot check (23/11/2026): the server's verification, the switch (both keys or nothing), the
 * per-form rule when Cloudflare can't be reached, the Settings check, and the plain words. Never a real key: the
 * fake keys here are made up, and Cloudflare's dummy test keys are public.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { allowedHostnames, botCheckOn, botCheckSiteKey, verifyBotCheck } = await import("@/lib/bot-check");
const { botCheckConfig, BOT_CHECK_FAILS_OPEN } = await import("@/config/bot-check");
const words = await import("@/lib/bot-check-words");
const { settingsCheck } = await import("@/lib/ops/settings-check");

const ON = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0xFAKE-SITE-KEY", TURNSTILE_SECRET_KEY: "FAKE-SECRET-NEVER-REAL", SITE_URL: "https://test.givezy.co.za", NODE_ENV: "production" };

/** A stand-in for Cloudflare's siteverify: records what was sent and answers as told. */
function cloudflare(answer: unknown, opts: { status?: number } = {}) {
  const calls: { url: string; body: URLSearchParams; signal?: AbortSignal | null }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams, signal: init.signal });
    return new Response(JSON.stringify(answer), { status: opts.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const pass = (over: Record<string, unknown> = {}) => ({ success: true, hostname: "test.givezy.co.za", action: "sign-in", "error-codes": [], ...over });

afterEach(() => vi.restoreAllMocks());

describe("the switch", () => {
  it("is on only with both keys", () => {
    expect(botCheckOn(ON)).toBe(true);
    expect(botCheckOn({ ...ON, TURNSTILE_SECRET_KEY: "" })).toBe(false);
    expect(botCheckOn({ ...ON, NEXT_PUBLIC_TURNSTILE_SITE_KEY: " " })).toBe(false);
    expect(botCheckOn({})).toBe(false);
    expect(botCheckSiteKey(ON)).toBe("0xFAKE-SITE-KEY");
    expect(botCheckSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0xFAKE-SITE-KEY" })).toBeNull();
  });

  it("off, every form passes without asking Cloudflare", async () => {
    const cf = cloudflare(pass());
    for (const action of ["sign-in", "give", "charity-request", "fresh-link"] as const) {
      expect(await verifyBotCheck({ token: null, action, ip: "198.51.100.1", env: {}, fetchImpl: cf.fetchImpl })).toEqual({ ok: true, skipped: "off" });
    }
    expect(cf.calls).toHaveLength(0);
  });
});

describe("the server's verification", () => {
  it("passes a good token, sending the secret, the token and the visitor's address, with a short timeout", async () => {
    const cf = cloudflare(pass());
    expect(await verifyBotCheck({ token: "tok-1", action: "sign-in", ip: "198.51.100.1", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: true });
    expect(cf.calls).toHaveLength(1);
    expect(cf.calls[0].url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(cf.calls[0].body.get("secret")).toBe(ON.TURNSTILE_SECRET_KEY);
    expect(cf.calls[0].body.get("response")).toBe("tok-1");
    expect(cf.calls[0].body.get("remoteip")).toBe("198.51.100.1");
    expect(cf.calls[0].signal).toBeInstanceOf(AbortSignal);
    expect(botCheckConfig.verifyTimeoutMs).toBeLessThanOrEqual(5000);
  });

  it("sends no address when we don't know it", async () => {
    const cf = cloudflare(pass());
    await verifyBotCheck({ token: "tok", action: "sign-in", ip: "unknown", env: ON, fetchImpl: cf.fetchImpl });
    expect(cf.calls[0].body.has("remoteip")).toBe(false);
  });

  it("refuses a missing token without asking Cloudflare", async () => {
    const cf = cloudflare(pass());
    for (const token of [null, undefined, "", "   "]) {
      expect(await verifyBotCheck({ token, action: "give", ip: "1.2.3.4", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: false, reason: "missing" });
    }
    expect(cf.calls).toHaveLength(0);
  });

  it("refuses a token longer than Cloudflare ever makes, without asking", async () => {
    const cf = cloudflare(pass());
    expect(await verifyBotCheck({ token: "x".repeat(2049), action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: false, reason: "refused" });
    expect(cf.calls).toHaveLength(0);
  });

  it("refuses what Cloudflare refuses: a bad, expired or reused token", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const code of ["invalid-input-response", "timeout-or-duplicate", "missing-input-response"]) {
      const cf = cloudflare({ success: false, "error-codes": [code] });
      expect(await verifyBotCheck({ token: "tok", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: false, reason: "refused" });
    }
  });

  it("refuses a token earned on another address", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cf = cloudflare(pass({ hostname: "evil.example" }));
    expect(await verifyBotCheck({ token: "tok", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: false, reason: "refused" });
    const none = cloudflare(pass({ hostname: undefined }));
    expect(await verifyBotCheck({ token: "tok", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: none.fetchImpl })).toEqual({ ok: false, reason: "refused" });
  });

  it("refuses a token earned on another form (a sign-in token can't start a gift)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cf = cloudflare(pass({ action: "sign-in" }));
    expect(await verifyBotCheck({ token: "tok", action: "give", ip: "1.2.3.4", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: false, reason: "refused" });
  });

  it("the live site's address is allowed there, and the local ones only on a developer's machine", () => {
    expect(allowedHostnames({ SITE_URL: "https://givezy.co.za", NODE_ENV: "production" })).toEqual(["givezy.co.za"]);
    expect(allowedHostnames({ SITE_URL: "http://127.0.0.1:3000", NODE_ENV: "development" })).toEqual(["127.0.0.1", "localhost"]);
    expect(allowedHostnames({ SITE_URL: "not a url", NODE_ENV: "production" })).toEqual([]);
  });

  it("Cloudflare's test keys (local only) skip the address and form checks: they pass everyone anyway", async () => {
    const cf = cloudflare({ success: true, hostname: "example.com", "error-codes": [], metadata: { result_with_testing_key: true } });
    expect(await verifyBotCheck({ token: "XXXX.DUMMY.TOKEN.XXXX", action: "give", ip: "1.2.3.4", env: ON, fetchImpl: cf.fetchImpl })).toEqual({ ok: true });
  });

  it("never logs the token or the secret", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logged.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a.join(" ")));
    await verifyBotCheck({ token: "SECRET-TOKEN-VALUE", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: cloudflare({ success: false, "error-codes": ["invalid-input-response"] }).fetchImpl });
    await verifyBotCheck({ token: "SECRET-TOKEN-VALUE", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain("SECRET-TOKEN-VALUE");
      expect(line).not.toContain(ON.TURNSTILE_SECRET_KEY);
    }
  });
});

describe("when Cloudflare can't be reached: closed for emails, open for giving and requests", () => {
  const down = {
    "a network error": (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch,
    "a timeout": (async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }) as unknown as typeof fetch,
    "a server error": cloudflare({}, { status: 503 }).fetchImpl,
    "an answer that isn't JSON": (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch,
    "Cloudflare's own internal error": cloudflare({ success: false, "error-codes": ["internal-error"] }).fetchImpl,
    "our secret refused (a setup mistake)": cloudflare({ success: false, "error-codes": ["invalid-input-secret"] }).fetchImpl,
  };

  it.each(Object.entries(down))("%s", async (_what, fetchImpl) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verifyBotCheck({ token: "tok", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl })).toEqual({ ok: false, reason: "unreachable" });
    expect(await verifyBotCheck({ token: "tok", action: "fresh-link", ip: "1.2.3.4", env: ON, fetchImpl })).toEqual({ ok: false, reason: "unreachable" });
    expect(await verifyBotCheck({ token: "tok", action: "give", ip: "1.2.3.4", env: ON, fetchImpl })).toEqual({ ok: true, skipped: "cloudflare-unreachable" });
    expect(await verifyBotCheck({ token: "tok", action: "charity-request", ip: "1.2.3.4", env: ON, fetchImpl })).toEqual({ ok: true, skipped: "cloudflare-unreachable" });
  });

  it("the real timeout fires: a Cloudflare that never answers is given up on", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError"))))) as unknown as typeof fetch;
    const answer = verifyBotCheck({ token: "tok", action: "sign-in", ip: "1.2.3.4", env: ON, fetchImpl: hang });
    await vi.advanceTimersByTimeAsync(botCheckConfig.verifyTimeoutMs + 50);
    expect(await answer).toEqual({ ok: false, reason: "unreachable" });
    vi.useRealTimers();
  });

  it("fails open is still logged, so an outage shows", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await verifyBotCheck({ token: "tok", action: "give", ip: "1.2.3.4", env: ON, fetchImpl: down["a network error"] });
    expect(warn.mock.calls.join(" ")).toMatch(/give: Cloudflare unreachable/);
  });

  it("the rule per form is the one decided", () => {
    expect(BOT_CHECK_FAILS_OPEN).toEqual({ "sign-in": false, "fresh-link": false, give: true, "charity-request": true });
  });

  it("a missing or refused token is never let through, even on a form that fails open", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await verifyBotCheck({ token: "", action: "give", ip: "1.2.3.4", env: ON })).ok).toBe(false);
    expect((await verifyBotCheck({ token: "t", action: "give", ip: "1.2.3.4", env: ON, fetchImpl: cloudflare({ success: false, "error-codes": ["invalid-input-response"] }).fetchImpl })).ok).toBe(false);
  });
});

describe("the words", () => {
  const all = [
    words.botCheckRefusedMessage("sign-in", "the button"),
    words.botCheckRefusedMessage("give", "Give", { contact: false }),
    words.botCheckRefusedMessage("charity-request", "Send request"),
    words.botCheckRefusedMessage("fresh-link", "Email me a fresh link"),
    words.botCheckUnreachableMessage(),
    words.botCheckLoadFailedMessage("give", true),
    words.botCheckLoadFailedMessage("sign-in", false),
    words.botCheckInteractiveMessage("Give"),
    words.BOT_CHECK_WAITING,
  ];

  it("say what happened, what was kept and what to do, with no exclamation marks or long dashes", () => {
    for (const w of all) {
      expect(w).not.toMatch(/[!—–]/);
      expect(w).not.toMatch(/turnstile|cloudflare|captcha/i);
    }
    expect(words.botCheckRefusedMessage("give", "Give", { contact: false })).toMatch(/nothing was charged/i);
    expect(words.botCheckLoadFailedMessage("give", false)).toMatch(/nothing was charged/i);
    expect(words.botCheckLoadFailedMessage("give", false)).toMatch(/What you typed is still here/);
    expect(words.botCheckRefusedMessage("sign-in", "the button")).toMatch(/No email was sent/);
    expect(words.botCheckUnreachableMessage()).toBe("We couldn't check this was you just now. Nothing was sent. Please try again in a minute. If it keeps happening, email hello@givezy.co.za.");
    expect(words.botCheckLoadFailedMessage("sign-in", true)).toMatch(/You're offline/);
  });
});

describe("the Settings check", () => {
  const base = { SITE_URL: "https://givezy.co.za" };
  const row = (env: Record<string, string>, name: string) => settingsCheck(env).find((c) => c.name === name);

  it("off is for later, not a problem", () => {
    expect(row(base, "NEXT_PUBLIC_TURNSTILE_SITE_KEY")?.status).toBe("later");
    expect(row(base, "TURNSTILE_SECRET_KEY")).toBeUndefined();
  });

  it("half set is a problem either way round", () => {
    expect(row({ ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4FAKE" }, "TURNSTILE_SECRET_KEY")?.status).toBe("fix");
    expect(row({ ...base, TURNSTILE_SECRET_KEY: "FAKE-SECRET-NEVER-REAL" }, "NEXT_PUBLIC_TURNSTILE_SITE_KEY")?.status).toBe("fix");
  });

  it("both set is on, and the secret is only ever present or missing", () => {
    const env = { ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4FAKE", TURNSTILE_SECRET_KEY: "FAKE-SECRET-NEVER-REAL" };
    expect(row(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY")).toMatchObject({ status: "ok", says: "Set: the bot check is on." });
    expect(row(env, "TURNSTILE_SECRET_KEY")).toMatchObject({ status: "ok", says: "Set." });
    expect(JSON.stringify(settingsCheck(env))).not.toContain("FAKE-SECRET-NEVER-REAL");
  });

  it("Cloudflare's let-everyone-through test key is refused on the live site, fine on the test site", () => {
    const keys = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_SECRET_KEY: "x" };
    expect(row({ ...base, ...keys }, "NEXT_PUBLIC_TURNSTILE_SITE_KEY")?.status).toBe("fix");
    expect(row({ SITE_URL: "https://test.givezy.co.za", ...keys }, "NEXT_PUBLIC_TURNSTILE_SITE_KEY")?.status).toBe("ok");
  });
});
