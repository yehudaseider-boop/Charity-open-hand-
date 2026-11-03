import type { MetadataRoute } from "next";

/** The public pages that are always there. Sign-in, admin, confirmation and receipt pages stay out (see robots.ts). */
const FIXED = ["", "/charities", "/for-charities", "/privacy", "/terms"];

/** Every public page and every approved charity's page, for search engines. */
export function sitemapEntries(origin: string, charities: { slug: string; updated_at: string | null }[]): MetadataRoute.Sitemap {
  const base = origin.replace(/\/+$/, "");
  const fixed = FIXED.map((path) => ({ url: `${base}${path || "/"}` }));
  const pages = charities
    .filter((c) => /^[a-z0-9-]+$/.test(c.slug))
    .map((c) => ({ url: `${base}/c/${c.slug}`, ...(c.updated_at ? { lastModified: new Date(c.updated_at) } : {}) }));
  return [...fixed, ...pages];
}
