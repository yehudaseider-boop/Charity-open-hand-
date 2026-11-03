import { createClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/request-origin";
import { llmsText } from "@/lib/seo/llms";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Rebuilt at most once an hour, like the site map: a newly approved charity shows up within the hour.
export const revalidate = 3600;

/** /llms.txt: the plain guide to Givezy for AI chatbots and assistants (see lib/seo/llms.ts). */
export async function GET() {
  let origin = "";
  try {
    origin = siteOrigin("http://localhost:3000");
  } catch {
    // SITE_URL not set yet: relative links are still better than no guide.
  }
  let charities: { slug: string; name_en: string }[] = [];
  try {
    // Read as an anonymous visitor: row-level security only returns approved charities.
    const db = createClient(supabaseUrl(), supabasePublishableKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("charities").select("slug, name_en").eq("status", "approved").order("name_en").limit(1000);
    if (error) throw new Error(error.message);
    charities = data ?? [];
  } catch (err) {
    // The guide is still worth serving without the charity list.
    console.error(err);
  }
  return new Response(llmsText(origin, charities), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
