import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/request-origin";

/** Search engines may index the public pages, never sign-in, admin or confirmation pages. */
export default function robots(): MetadataRoute.Robots {
  let origin = "";
  try {
    origin = siteOrigin("http://localhost:3000");
  } catch {
    // SITE_URL not set yet: still block the private pages, just without the site map line.
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/charity-admin", "/account", "/api/", "/auth/", "/login", "/mfa", "/agree", "/donate/return", "/thanks/", "/news/", "/test-gateway", "/documents/", "/receipts/", "/monthly/"],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
