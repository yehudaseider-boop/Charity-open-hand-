import type { MetadataRoute } from "next";

/** Public pages may be indexed; sign-in, account, admin, payment and API routes may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/charity-admin", "/account", "/mfa", "/agree", "/test-gateway", "/donate/return", "/api", "/auth"],
    },
  };
}
