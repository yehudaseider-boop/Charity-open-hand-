/**
 * Which security headers each address gets (next.config.ts), matched the way Next matches a header rule's source
 * (security review 23/11/2026): every page gets the site's own, and only /app-preview and its folder get the preview's.
 */
import { describe, expect, it } from "vitest";
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import nextConfig from "../next.config";

async function headersFor(path: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const rule of await nextConfig.headers!()) {
    const { regex } = buildCustomRoute("header", rule);
    // Later rules win for the same header, as in Next.
    if (new RegExp(regex).test(path)) for (const h of rule.headers) out.set(h.key, h.value);
  }
  return out;
}
const directive = (csp: string | undefined, name: string) =>
  (csp ?? "").split(";").map((d) => d.trim().split(/\s+/)).find(([n]) => n === name)?.slice(1);

describe("security headers", () => {
  it.each(["/", "/c/hillside-kitchen", "/app-previewz", "/app-preview-old/index.html", "/app-previews/app", "/login"])("%s gets the site's own headers", async (path) => {
    const h = await headersFor(path);
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(directive(h.get("Content-Security-Policy"), "frame-ancestors")).toEqual(["'none'"]);
    expect(h.get("X-Robots-Tag")).toBeUndefined();
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each(["/", "/c/hillside-kitchen", "/charities"])("%s allows Cloudflare's bot check, for a move to Sign in or Give without a full load", async (path) => {
    const csp = (await headersFor(path)).get("Content-Security-Policy");
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "frame-src")).toContain("https://challenges.cloudflare.com");
  });

  it.each(["/app-preview", "/app-preview/", "/app-preview/index.html", "/app-preview/app/give/hillside"])("%s gets only the preview's headers", async (path) => {
    const h = await headersFor(path);
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const csp = h.get("Content-Security-Policy");
    expect(directive(csp, "frame-ancestors")).toEqual(["'self'"]);
    // The preview fetches nothing from elsewhere: no database or website address is built in.
    expect(directive(csp, "connect-src")).toEqual(["'self'"]);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
