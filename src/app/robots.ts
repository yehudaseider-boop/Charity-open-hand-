import type { MetadataRoute } from "next";

/** Search engines may index the public pages, never sign-in, admin or confirmation pages. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/charity-admin", "/account", "/api/", "/auth/", "/login", "/mfa", "/agree", "/donate/return", "/thanks/", "/test-gateway", "/documents/", "/receipts/"],
    },
  };
}
