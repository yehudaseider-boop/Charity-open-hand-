import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { donatableFrom, DONATABLE_COLUMNS } from "@/lib/donations/charity";
import { isRunning } from "./campaigns";
import { loadCampaigns, type CampaignRow } from "./campaign-queries";
import { activeFocus, FOCUS_COLUMNS, type FocusRow } from "./focus";
import { loadStories } from "./queries";

/**
 * What a charity's public page and give page show, kept per charity (24/11/2026). Only public, non-personal reads
 * live here: the charity's profile, its photos and updates, its campaigns, its focus. Nothing that depends on who is
 * looking (the signed-in donor, their saved ID, the cart) and nothing a gift's amount depends on: checkout reads the
 * charity live (loadDonatableCharity), and the fees and limits come from platform.ts, never from here.
 *
 * Fresh when it matters: every write that changes what these pages show calls revalidateCharityPages (below), and
 * whatever write is ever missed still expires on its own after PUBLIC_CHARITY_MAX_STALE_SECONDS (an entry older than
 * that is never shown, not even once more while it refreshes: see cachedRead). A suspended or unlisted charity
 * therefore stops showing within that time even if its write forgot to say so (and at once when the write did say
 * so). Campaign and focus dates are checked on every request, not inside the cache, so a campaign that ends or a
 * focus that starts changes on the minute without waiting for an expiry.
 */
export const PUBLIC_CHARITY_MAX_STALE_SECONDS = 60;

/** Bumped when the shape of what is cached changes, so a new build never reads an old shape. */
const CACHE_VERSION = "v1";

export const publicCharityTag = (slug: string) => `public-charity:${slug}`;

/**
 * One cached read. Next serves an expired entry once more while it refreshes behind the visitor (stale-while-
 * revalidate), which would stretch the limit by one visit. So each entry carries the time it was read, and one older
 * than the limit is not trusted: that visit reads live, and the limit is a real limit.
 */
function cachedRead<A extends unknown[], T>(slug: string, name: string, read: (...args: A) => Promise<T>) {
  const cached = unstable_cache(async (...args: A) => ({ at: Date.now(), value: await read(...args) }), [CACHE_VERSION, name, slug], {
    revalidate: PUBLIC_CHARITY_MAX_STALE_SECONDS,
    tags: [publicCharityTag(slug)],
  });
  return async (...args: A): Promise<T> => {
    const hit = await cached(...args);
    return Date.now() - hit.at > PUBLIC_CHARITY_MAX_STALE_SECONDS * 1000 ? read(...args) : hit.value;
  };
}

const PAGE_COLUMNS =
  "legal_name_en, description_en, funds_use_en, impact_en, website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, suburb, city, video_provider, video_id, charity_categories(categories(name_en))";

/** The listed (approved) charity at this address with everything both pages need, or null. One read, cached. */
/** What a charity's address can be: nothing else is ever looked up or kept (review 24/11/2026: no entry per made-up address). */
export const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function loadListedCharity(slug: string) {
  if (slug.length > 64 || !SLUG_SHAPE.test(slug)) return Promise.resolve(null);
  return cachedRead(slug, "listed-charity", async (s: string) => {
    const { data, error } = await createAdminClient().from("charities").select(`${DONATABLE_COLUMNS}, ${PAGE_COLUMNS}`).eq("slug", s).eq("status", "approved").maybeSingle();
    // A read that failed must not become "no such charity" for a minute: throwing keeps it out of the cache.
    if (error) throw error;
    return data;
  })(slug);
}

/** Is there a listed charity here? A failed read says yes, so the page shows its own error, not "not found". */
export async function charityIsListed(slug: string): Promise<boolean> {
  try {
    return Boolean(await loadListedCharity(slug));
  } catch {
    return true;
  }
}

/** The page's charity as the pages use it: the cached row plus what is worked out per request (pause, gateway). */
export async function loadPublicDonatable(slug: string) {
  const row = await loadListedCharity(slug);
  return row ? donatableFrom(row) : null;
}

/** Photos and the latest updates, cached per charity. */
export function loadPublicStories(slug: string, charityId: string, updatesLimit = 5) {
  return cachedRead(slug, "stories", (id: string, limit: number) => loadStories(id, limit, createPublicClient()))(charityId, updatesLimit);
}

/** All the charity's public campaigns with totals, cached. Whether one is running is decided on each request. */
export function loadPublicAllCampaigns(slug: string, charityId: string): Promise<CampaignRow[]> {
  return cachedRead(slug, "campaigns", (id: string) => loadCampaigns(id, createPublicClient()))(charityId);
}

/** Campaigns taking gifts right now: a campaign past its last day drops off on the next request, with no expiry to wait for. */
export async function loadPublicOpenCampaigns(slug: string, charityId: string, now: Date = new Date()): Promise<CampaignRow[]> {
  return (await loadPublicAllCampaigns(slug, charityId)).filter((c) => isRunning(c, now));
}

/** The charity's focus row, cached; whether it is showing today is decided on each request. */
export function loadPublicFocusRow(slug: string, charityId: string): Promise<FocusRow | null> {
  return cachedRead(slug, "focus", async (id: string) => {
    const { data, error } = await createAdminClient().from("charity_focus").select(FOCUS_COLUMNS).eq("charity_id", id).maybeSingle();
    // A bonus: if it can't be read the page shows without it, and the failure is not kept.
    if (error) throw error;
    return (data as FocusRow | null) ?? null;
  })(charityId);
}

export async function loadPublicFocusToday(slug: string, charityId: string, today: string) {
  try {
    return activeFocus(await loadPublicFocusRow(slug, charityId), today);
  } catch {
    return null;
  }
}

/** Say that this charity's public pages changed: the next visit reads fresh data. Never throws (a cache that can't be reached must not fail a save). */
export function revalidateCharitySlugs(...slugs: (string | null | undefined)[]): void {
  for (const slug of new Set(slugs.filter((s): s is string => Boolean(s)))) {
    try {
      revalidateTag(publicCharityTag(slug), { expire: 0 });
    } catch (e) {
      console.error("public charity cache: could not refresh", slug, e);
    }
  }
}

/**
 * Call after any write that changes what the charity page or give page shows (profile text, photos, updates, video,
 * categories, campaigns, focus, status, s18A, verification, payment connection). Looks the address up from the id.
 */
export async function revalidateCharityPages(charityId: string, ...otherSlugs: (string | null | undefined)[]): Promise<void> {
  try {
    const { data } = await createAdminClient().from("charities").select("slug").eq("id", charityId).maybeSingle();
    revalidateCharitySlugs(data?.slug, ...otherSlugs);
  } catch (e) {
    console.error("public charity cache: could not look up the address for", charityId, e);
  }
}
