import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-path";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/charity-admin/abc?x=1")).toBe("/charity-admin/abc?x=1");
  });
  it.each(["//evil.example", "/\\evil.example", "/%5Cevil" /* stays encoded: safe */, "https://evil.example", "evil", "/\tx", "", null, 42])(
    "%s",
    (v) => {
      const out = safeNextPath(v);
      if (v === "/%5Cevil") expect(out).toBe("/%5Cevil");
      else expect(out).toBe("/account");
    },
  );
});

import { clientIp } from "@/lib/client-ip";

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("never trusts the client-typed leftmost forwarded address", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), {})).toBe("203.0.113.9");
  });
  it("uses the host's header when one is configured", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1", "cf-connecting-ip": "198.51.100.2" }), { CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("198.51.100.2");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1" }), { CLIENT_IP_HEADER: "x-real-ip" })).toBe("unknown");
  });
});

import { siteUrl } from "../apps/mobile/src/lib/website";

describe("app links to the website's legal pages", () => {
  it("builds https links only", () => {
    expect(siteUrl("https://example.co.za/", "/privacy")).toBe("https://example.co.za/privacy");
    expect(siteUrl("http://example.co.za", "/privacy")).toBeNull();
    expect(siteUrl(undefined, "/terms")).toBeNull();
    expect(siteUrl("https://example.co.za", "privacy")).toBeNull();
  });
});
