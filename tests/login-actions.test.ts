/**
 * Sign-in on the website (security review, 12/11/2026):
 * - a stranger asking for links or typing wrong codes for someone's email cannot lock that person out from their own
 *   connection (limits per email together with the address, plus higher ceilings per email and per address);
 * - only wrong codes count, never a right one;
 * - a bad email typed on the apply page goes back to the apply page with the plain message and both fields kept;
 * - "Check your email" names an address only with our own short-lived proof.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let ip = "198.51.100.1";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => ip }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));

/** An in-memory limits table, counting the same way as lib/rate-limit.ts. */
const events: { bucket: string; key: string; id?: string }[] = [];
let nextId = 0;
const count = (bucket: string, key: string) => events.filter((e) => e.bucket === bucket && e.key === key).length;
vi.mock("@/lib/rate-limit", () => ({
  hashedKey: (kind: string, v: string) => `${kind}#${v.trim().toLowerCase()}`,
  ipKeys: (a: string) => (a ? [`ip#${a}`] : []),
  hitRateLimit: async (bucket: string, keys: string[], limit: number) => {
    for (const key of keys) events.push({ bucket, key });
    return keys.some((key) => count(bucket, key) > limit);
  },
  rateLimitReached: async (bucket: string, keys: string[], limit: number) => keys.some((key) => count(bucket, key) >= limit),
  takeAttempt: async (bucket: string, keys: string[], limit: number) => {
    const ids: string[] = [];
    for (const key of keys) {
      const id = `e${++nextId}`;
      events.push({ bucket, key, id });
      ids.push(id);
    }
    return { limited: keys.some((key) => count(bucket, key) > limit), ids };
  },
  forgetAttempts: async (ids: string[]) => {
    for (const id of ids) {
      const i = events.findIndex((e) => e.id === id);
      if (i >= 0) events.splice(i, 1);
    }
  },
}));

const sentTo: string[] = [];
let codeIsRight = false;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOtp: async ({ email }: { email: string }) => (sentTo.push(email), { error: null }),
      verifyOtp: async () => (codeIsRight ? { data: { user: { id: "u1", email: "dana@example.com" } }, error: null } : { data: { user: null }, error: new Error("bad") }),
    },
  }),
}));
vi.mock("@/lib/donors/link", () => ({ linkDonorsToUser: async () => {} }));

const { sendLoginLink, verifyLoginCode } = await import("@/app/login/actions");
const { sentProofMatches, sentProof, signInMessages } = await import("@/lib/sign-in");

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
const askLink = (email: string, extra: Record<string, string> = {}) => whereTo(sendLoginLink(form({ email, next: "/account", ...extra })));
const tryCode = (email: string, code = "123456", s?: string) => whereTo(verifyLoginCode(form({ email, code, next: "/account", s: s ?? sentProof(email) ?? "" })));

beforeEach(() => {
  events.length = 0;
  sentTo.length = 0;
  codeIsRight = false;
  ip = "198.51.100.1";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
});

describe("asking for a sign-in link", () => {
  it("a stranger asking many times for someone's email does not stop that person on their own connection", async () => {
    ip = "203.0.113.66";
    for (let i = 0; i < 10; i++) await askLink("dana@example.com");
    expect(await askLink("dana@example.com")).toContain("error=busy");
    ip = "198.51.100.1";
    const url = await askLink("dana@example.com");
    expect(url).toMatch(/^\/login\?sent=1/);
  });

  it("each email still has a ceiling of its own, across many addresses", async () => {
    for (let i = 0; i < 30; i++) {
      ip = `203.0.113.${i}`;
      expect(await askLink("dana@example.com")).toMatch(/sent=1/);
    }
    ip = "203.0.113.200";
    expect(await askLink("dana@example.com")).toContain("error=busy");
  });

  it("sends to the 'Check your email' page with a proof for that address", async () => {
    const url = new URL(await askLink("dana@example.com"), "https://x.test");
    expect(url.searchParams.get("email")).toBe("dana@example.com");
    expect(sentProofMatches("dana@example.com", url.searchParams.get("s"))).toBe(true);
    expect(sentProofMatches("someone@example.com", url.searchParams.get("s"))).toBe(false);
  });
});

describe("typing the code", () => {
  it("only wrong codes count, and a stranger's wrong codes from elsewhere don't lock the owner out", async () => {
    ip = "203.0.113.66";
    for (let i = 0; i < 10; i++) expect(await tryCode("dana@example.com")).toContain("error=code");
    expect(await tryCode("dana@example.com")).toContain("error=tries");
    ip = "198.51.100.1";
    codeIsRight = true;
    expect(await tryCode("dana@example.com")).toBe("/account");
  });

  it("right codes are never counted", async () => {
    codeIsRight = true;
    for (let i = 0; i < 15; i++) expect(await tryCode("dana@example.com")).toBe("/account");
    expect(events).toEqual([]);
  });

  it("counts a try before checking the code, so guesses sent all at once can't slip past the limit", async () => {
    ip = "203.0.113.77";
    const results = await Promise.all(Array.from({ length: 14 }, () => tryCode("dana@example.com")));
    expect(results.filter((u) => u.includes("error=tries")).length).toBeGreaterThanOrEqual(4);
  });

  it("each email has a higher ceiling of its own for wrong codes", async () => {
    for (let i = 0; i < 50; i++) {
      ip = `203.0.113.${i}`;
      await tryCode("dana@example.com");
    }
    ip = "203.0.113.250";
    expect(await tryCode("dana@example.com")).toContain("error=tries");
  });

  it("a wrong code goes back to the code box for the same address, keeping the page's proof", async () => {
    const proof = sentProof("dana@example.com")!;
    const url = new URL(await tryCode("dana@example.com", "123456", proof), "https://x.test");
    expect(url.searchParams.get("error")).toBe("code");
    expect(url.searchParams.get("s")).toBe(proof);
  });

  it("never hands out a proof for an address it didn't send to", async () => {
    const url = new URL(await tryCode("someone@example.com", "123456", "made-up"), "https://x.test");
    expect(url.searchParams.get("error")).toBe("code");
    expect(url.searchParams.has("email")).toBe(false);
    expect(url.searchParams.has("s")).toBe(false);
    const bad = new URL(await tryCode("someone@example.com", "not-a-code", sentProof("dana@example.com")!), "https://x.test");
    expect(bad.searchParams.has("s")).toBe(false);
  });
});

describe("the apply page's form", () => {
  it("a bad email goes back to the apply page with the message and both fields kept", async () => {
    const url = new URL(await askLink("a@b", { apply_name: "Soup Kitchen", next: "/apply" }), "https://x.test");
    expect(url.pathname).toBe("/apply");
    expect(url.searchParams.get("error")).toBe("email");
    expect(url.searchParams.get("email")).toBe("a@b");
    expect(url.searchParams.get("name")).toBe("Soup Kitchen");
    expect(sentTo).toEqual([]);
  });

  it("keeps an invitation on the way back", async () => {
    const url = new URL(await askLink("a@b", { apply_name: "Soup Kitchen", next: "/apply?invite=abc" }), "https://x.test");
    expect(url.searchParams.get("invite")).toBe("abc");
  });

  it("a bad email from Sign in itself stays on Sign in", async () => {
    expect(await askLink("a@b")).toMatch(/^\/login\?error=email/);
  });

  it("has one wording for every message", () => {
    expect(signInMessages.email).toBe("Please enter a valid email address.");
    expect(signInMessages.tries).not.toMatch(/!/);
  });
});

describe("the proof behind 'We sent a link to …'", () => {
  it("runs out after an hour", () => {
    const now = Date.now();
    const proof = sentProof("dana@example.com", now)!;
    expect(sentProofMatches("Dana@Example.com", proof, now + 59 * 60_000)).toBe(true);
    expect(sentProofMatches("dana@example.com", proof, now + 61 * 60_000)).toBe(false);
  });

  it("refuses a made-up or missing proof", () => {
    expect(sentProofMatches("dana@example.com", undefined)).toBe(false);
    expect(sentProofMatches("dana@example.com", "9999999999.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });
});
