import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCsp, cspPolicyFor, newNonce, NONCE_AREAS } from "@/lib/csp";
import { authCookieOptions, cookiesAreSecure, isAuthCookie, markerFix, markerForWrite } from "@/lib/supabase/auth-cookies";
import { SIGNED_IN_MARKER, signedInMarker } from "@/lib/header-viewer";

const input = { dev: false, supabaseOrigin: "https://x.supabase.co", formActionOrigins: ["https://checkout.paystack.com"], videoFrameOrigins: ["https://www.youtube-nocookie.com", "https://player.vimeo.com"] };

describe("which pages get the nonce policy (23/11/2026)", () => {
  it("every sign-in, account, dashboard, give and receipt page does", () => {
    for (const p of ["/account", "/account/data/export", "/admin", "/admin/charities/abc", "/charity-admin/x/donations", "/login", "/login/app", "/mfa", "/auth/callback", "/agree", "/donate/return", "/c/northcliff/donate", "/c/northcliff/donate/", "/receipts/abc", "/documents/abc", "/monthly/new-card", "/apply", "/charities/request", "/thanks/stop", "/test-gateway", "/preview/give/northcliff", "/Preview/Give/northcliff/"]) {
      expect(cspPolicyFor(p), p).toBe("nonce");
    }
  });

  it("public pages keep the static policy", () => {
    for (const p of ["/", "/charities", "/browse-charities", "/c/northcliff", "/faq", "/for-donors", "/for-charities", "/privacy", "/terms", "/coming-soon", "/sitemap.xml", "/accounting", "/administration", "/c/donate", "/c/a/b/donate", "/charities/opengraph-image", "/preview/charities", "/preview/give"]) {
      expect(cspPolicyFor(p), p).toBe("static");
    }
  });

  it("a strange spelling is never looser", () => {
    expect(cspPolicyFor("/Account")).toBe("nonce");
    expect(cspPolicyFor("/C/x/DONATE")).toBe("nonce");
  });

  it("the list has no duplicates and each area is a path", () => {
    expect(new Set(NONCE_AREAS).size).toBe(NONCE_AREAS.length);
    for (const a of NONCE_AREAS) expect(a).toMatch(/^\/[a-z-]+(\/[a-z-]+)*$/);
  });

  it("every page in a nonce area is rendered per request (the nonce can't reach a page built ahead of time)", () => {
    // The one page in these areas that read nothing from the request says so explicitly.
    expect(readFileSync("src/app/login/app/page.tsx", "utf8")).toMatch(/await connection\(\)/);
  });
});

describe("the policies", () => {
  const nonce = newNonce();
  const strict = buildCsp({ ...input, nonce });
  const loose = buildCsp(input);
  const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("the nonce policy lets scripts run with the nonce only, and allows no inline scripts", () => {
    const scripts = directive(strict, "script-src");
    expect(scripts).toContain(`'nonce-${nonce}'`);
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("the static policy is the one the site had before, plus Cloudflare's bot check", () => {
    expect(directive(loose, "script-src")).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
  });

  it("both policies allow Cloudflare's bot check: its script and its frame, and nothing wider (23/11/2026)", () => {
    for (const csp of [strict, loose]) {
      expect(directive(csp, "script-src").split(" ")).toContain("https://challenges.cloudflare.com");
      expect(directive(csp, "frame-src")).toBe("frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://challenges.cloudflare.com");
      // Its guide asks for no connect-src of its own.
      expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
      // Exactly that one address, in exactly those two places: no wildcard, nothing else of Cloudflare's.
      expect(csp.match(/cloudflare/g)).toEqual(["cloudflare", "cloudflare"]);
      expect(csp).not.toContain("*");
    }
    // The nonce policy still runs only nonce'd scripts (and those they add): the host is for browsers without 'strict-dynamic'.
    expect(directive(strict, "script-src")).toBe(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`);
  });

  it("every other directive is the same in both", () => {
    const rest = (csp: string) => csp.split("; ").filter((d) => !d.startsWith("script-src ")).join("; ");
    expect(rest(strict)).toBe(rest(loose));
    expect(strict).toContain("frame-ancestors 'none'");
    expect(strict).toContain("form-action 'self' https://checkout.paystack.com");
    expect(strict).toContain("frame-src https://www.youtube-nocookie.com https://player.vimeo.com");
    expect(strict).toContain("img-src 'self' blob: data: https://x.supabase.co");
    expect(strict).toContain("object-src 'none'");
    expect(strict).toContain("upgrade-insecure-requests");
  });

  it("only development allows eval, and each request gets its own nonce", () => {
    expect(directive(buildCsp({ ...input, nonce, dev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(newNonce()).not.toBe(newNonce());
    expect(atob(nonce).length).toBeGreaterThanOrEqual(36);
  });

  it("the proxy builds the nonce policy and next.config the static one from the same module", () => {
    expect(readFileSync("src/proxy.ts", "utf8")).toMatch(/cspPolicyFor\(request\.nextUrl\.pathname\) === "nonce"/);
    expect(readFileSync("next.config.ts", "utf8")).toMatch(/buildCsp\(/);
  });
});

describe("sign-in cookies are httpOnly (23/11/2026)", () => {
  it("carry httpOnly and SameSite=Lax always, and Secure on the live site only", () => {
    expect(authCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(authCookieOptions(false).secure).toBe(false);
    expect(authCookieOptions(false).httpOnly).toBe(true);
    expect(cookiesAreSecure({ NODE_ENV: "production", SITE_URL: "https://givezy.co.za" })).toBe(true);
    expect(cookiesAreSecure({ NODE_ENV: "production", SITE_URL: "http://127.0.0.1:3000" })).toBe(false);
    expect(cookiesAreSecure({ NODE_ENV: "development", SITE_URL: "https://x" })).toBe(false);
  });

  it("the server client and the proxy both pass them to Supabase, and no browser client exists", () => {
    expect(readFileSync("src/lib/supabase/server.ts", "utf8")).toMatch(/cookieOptions: authCookieOptions\(\)/);
    expect(readFileSync("src/proxy.ts", "utf8")).toMatch(/cookieOptions: authCookieOptions\(\)/);
    for (const f of ["src/lib/supabase/server.ts", "src/proxy.ts", "src/lib/supabase/admin.ts", "src/lib/supabase/public.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/createBrowserClient/);
    }
  });

  it("the header reads only the marker, never a sign-in cookie", () => {
    const nav = readFileSync("src/components/header-nav.tsx", "utf8");
    expect(nav).toMatch(/signedInMarker\(document\.cookie\)/);
    expect(nav).not.toMatch(/sb-|auth-token/);
  });

  it("knows Supabase's sign-in cookie, split or whole, and not the code-verifier", () => {
    expect(isAuthCookie("sb-abc-auth-token")).toBe(true);
    expect(isAuthCookie("sb-abc-auth-token.1")).toBe(true);
    expect(isAuthCookie("sb-abc-auth-token-code-verifier")).toBe(false);
  });

  it("the marker is set with a sign-in, removed with its clearing, and left alone otherwise", () => {
    const saved = markerForWrite([{ name: "sb-abc-auth-token", value: "base64-x" }], true)!;
    expect(saved.name).toBe(SIGNED_IN_MARKER);
    expect(saved.value).toMatch(/^[0-9a-f]{12}$/);
    expect(saved.value).not.toContain("base64");
    expect(saved.options).toMatchObject({ httpOnly: false, sameSite: "lax", secure: true, path: "/" });
    expect(saved.options.maxAge).toBeGreaterThan(0);
    expect(markerForWrite([{ name: "sb-abc-auth-token", value: "base64-y" }], true)!.value).not.toBe(saved.value);
    const cleared = markerForWrite([{ name: "sb-abc-auth-token.0", value: "" }, { name: "sb-abc-auth-token.1", value: "" }])!;
    expect(cleared.value).toBe("");
    expect(cleared.options.maxAge).toBe(0);
    expect(markerForWrite([{ name: "sb-abc-auth-token-code-verifier", value: "v" }])).toBeNull();
    expect(markerForWrite([])).toBeNull();
  });

  it("someone signed in before gets a marker, a marker with no sign-in goes, and a matching pair is left alone", () => {
    expect(markerFix([{ name: "sb-abc-auth-token", value: "x" }])?.value).toMatch(/^[0-9a-f]{12}$/);
    expect(markerFix([{ name: SIGNED_IN_MARKER, value: "abc" }])?.options.maxAge).toBe(0);
    expect(markerFix([{ name: "sb-abc-auth-token", value: "x" }, { name: SIGNED_IN_MARKER, value: "abc" }])).toBeNull();
    expect(markerFix([{ name: "sb-abc-auth-token", value: "" }, { name: SIGNED_IN_MARKER, value: "abc" }])?.options.maxAge).toBe(0);
    expect(markerFix([])).toBeNull();
  });

  it("the header reads the marker from document.cookie", () => {
    expect(signedInMarker("a=1; gz-in=abc123; b=2")).toBe("abc123");
    expect(signedInMarker("gz-in=")).toBeNull();
    expect(signedInMarker("a=1; sb-abc-auth-token=secret")).toBeNull();
    expect(signedInMarker("xgz-in=abc")).toBeNull();
  });
});
