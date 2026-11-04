import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { canIssue18a } from "@/lib/charities";
import { initials } from "@/lib/charity/initials";
import { publicImageUrl } from "@/lib/charity/queries";
import { shareImage, shareImageSize, shareImageType } from "@/lib/seo/share-image";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

export const alt = "Give to this charity on Givezy";
export const size = shareImageSize;
export const contentType = shareImageType;
// Rebuilt at most once an hour, like the site map: a new cover photo shows within the hour.
export const revalidate = 3600;

/** The charity's cover photo (or logo) as a square PNG, or null when there is none or it can't be read. */
async function photo(path: string | null): Promise<string | null> {
  const url = publicImageUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    // Covers can be WebP, which the share-image renderer can't read: always hand it a PNG.
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(800, 800, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Read as an anonymous visitor: row-level security only returns approved charities.
  const db = createClient(supabaseUrl(), supabasePublishableKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: c } = await db
    .from("charities")
    .select("name_en, suburb, city, cover_path, logo_path, is_s18a, mandate_signed_at, is_verified")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();

  if (!c) {
    return shareImage({ headline: ["Give on", { blue: "Givezy" }], subline: "Registered South African charities, checked by us.", art: { person: "loveIt" } });
  }
  const picture = (await photo(c.cover_path)) ?? (await photo(c.logo_path));
  const area = [c.suburb, c.city].filter(Boolean).join(", ");
  return shareImage({
    headline: ["Give to", { blue: c.name_en }],
    subline: area ? `${area}. Checked by Givezy before it could take a gift.` : "Checked by Givezy before it could take a gift.",
    art: picture ? { photo: picture } : { initials: initials(c.name_en) },
    tick: canIssue18a(c) ? "s18A receipts" : undefined,
  });
}
