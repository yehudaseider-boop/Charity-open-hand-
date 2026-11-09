import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasSignInCookie, signInFingerprint } from "@/lib/header-viewer";

describe("knowing a sign-in from the cookies alone", () => {
  it("finds Supabase's sign-in cookie, split or whole, and nothing else", () => {
    expect(hasSignInCookie(["sb-abcd-auth-token"])).toBe(true);
    expect(hasSignInCookie(["other", "sb-abcd-auth-token.0", "sb-abcd-auth-token.1"])).toBe(true);
    expect(hasSignInCookie([])).toBe(false);
    expect(hasSignInCookie(["gz_focus", "sb-abcd-auth-token-code-verifier", "my-sb-abcd-auth-token"])).toBe(false);
  });

  it("gives the same fingerprint for the same sign-in, a new one when it changes, and none when signed out", () => {
    const a = signInFingerprint("gz_focus=x; sb-abcd-auth-token=one");
    expect(a).toBeTruthy();
    expect(signInFingerprint("sb-abcd-auth-token=one; theme=light")).toBe(a);
    expect(signInFingerprint("sb-abcd-auth-token=two")).not.toBe(a);
    expect(signInFingerprint("sb-abcd-auth-token.0=one; sb-abcd-auth-token.1=two")).toBeTruthy();
    expect(signInFingerprint("")).toBeNull();
    expect(signInFingerprint("sb-abcd-auth-token=")).toBeNull();
    expect(signInFingerprint("gz_focus=x")).toBeNull();
  });

  it("never keeps the token itself", () => {
    const fp = signInFingerprint("sb-abcd-auth-token=base64-secretvalue")!;
    expect(fp).not.toContain("secret");
    expect(fp.length).toBeLessThan(10);
  });
});

describe("public pages stay cacheable", () => {
  // The shared layout, header and footer must never read the request: one read makes every page on the site
  // rebuild on each visit, far from South Africa (09/11/2026). Who is looking is asked from the browser instead.
  it("the layout, header and footer read nothing from the request", () => {
    for (const f of ["src/app/layout.tsx", "src/components/site-header.tsx", "src/components/page-footer.tsx", "src/components/legal.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/next\/headers|getViewer|currentFocus|createClient\(|cookies\(\)/);
    }
  });

  it("the home page uses public data only and is rebuilt every few minutes", () => {
    const src = readFileSync("src/app/page.tsx", "utf8");
    expect(src).toMatch(/export const revalidate = \d+/);
    expect(src).not.toMatch(/supabase\/server|getViewer|next\/headers/);
  });
});
