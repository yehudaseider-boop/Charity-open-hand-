import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isComingSoonHost } from "@/lib/coming-soon";
import { siteOrigin } from "@/lib/request-origin";

/**
 * Search engines and AI assistants (ChatGPT, Claude, Perplexity and the rest) may read the public pages, never
 * sign-in, admin or confirmation pages. Whether a page may be listed in results is the page's own robots tag
 * (hidden everywhere but the live site, see lib/seo/indexing.ts).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // On the pre-launch address (givezy.co.za) the site map would name the test site (SITE_URL until launch): leave it out.
  const host = (await headers()).get("host") ?? "";
  const soon = isComingSoonHost(host.replace(/:\d+$/, ""), process.env.COMING_SOON_HOSTS);
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
    ...(origin && !soon ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
