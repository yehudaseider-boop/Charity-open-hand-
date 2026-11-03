import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/request-origin";

/**
 * Search engines and AI assistants (ChatGPT, Claude, Perplexity and the rest) may read the public pages, never
 * sign-in, admin or confirmation pages. Whether a page may be listed in results is the page's own robots tag
 * (hidden everywhere but the live site, see lib/seo/indexing.ts).
 */
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
