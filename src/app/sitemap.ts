import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/request-origin";
import { sitemapEntries } from "@/lib/seo/sitemap";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Rebuilt at most once an hour: a newly approved charity shows up within the hour.
export const revalidate = 3600;

/** The site map search engines read. Read as an anonymous visitor, so row-level security only returns approved charities. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let origin: string;
  try {
    origin = siteOrigin("http://localhost:3000");
  } catch {
    // SITE_URL not set yet: an empty site map rather than a failed build.
    return [];
  }
  try {
    const db = createClient(supabaseUrl(), supabasePublishableKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("charities").select("slug, updated_at").eq("status", "approved").order("slug").limit(5000);
    if (error) throw new Error(error.message);
    return sitemapEntries(origin, data ?? []);
  } catch (err) {
    // The fixed pages are still worth listing when the database can't be reached.
    console.error(err);
    return sitemapEntries(origin, []);
  }
}
