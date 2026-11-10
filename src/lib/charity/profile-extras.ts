import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { activeFocus, FOCUS_COLUMNS, type Focus, type FocusRow } from "./focus";
import { videoFrom, type ProfileVideo } from "./video";

/**
 * The profile's extras (10/11/2026): the charity's video and its own focus. Each is read on its own and treated
 * as a bonus: if it can't be read (for example on a database that doesn't have it yet), the page shows without
 * it rather than failing. `available: false` tells the editor to say so instead of offering a form that can't save.
 */

/** A charity's video, read as the current visitor (row-level security only shows approved charities to the public). */
export async function loadVideo(charityId: string): Promise<{ available: boolean; video: ProfileVideo | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("charities").select("video_provider, video_id").eq("id", charityId).maybeSingle();
  if (error) return { available: false, video: null };
  return { available: true, video: videoFrom(data) };
}

/**
 * The focus to show on the public page today (Johannesburg date), or null. Row-level security already hides one
 * outside its dates or for a charity that isn't approved; the dates are checked again here because the charity's
 * own admins can read theirs at any time.
 */
export async function loadPublicFocus(charityId: string, today: string): Promise<Focus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_focus").select(FOCUS_COLUMNS).eq("charity_id", charityId).maybeSingle();
  if (error) return null;
  return activeFocus(data as FocusRow | null, today);
}

/** The charity's focus for its editor, whatever its dates. Call after loadCharityForManager. */
export async function loadFocusForManager(charityId: string): Promise<{ available: boolean; row: FocusRow | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("charity_focus").select(FOCUS_COLUMNS).eq("charity_id", charityId).maybeSingle();
  if (error) return { available: false, row: null };
  return { available: true, row: (data as FocusRow | null) ?? null };
}

/**
 * Save or remove (null) the charity's one focus. The table takes no writes from browsers, so this uses the
 * service role: only call it after loadCharityForManager has confirmed the signed-in person manages the charity.
 */
export async function writeFocus(charityId: string, row: FocusRow | null, userId: string): Promise<void> {
  const db = createAdminClient();
  if (!row) {
    const { error } = await db.from("charity_focus").delete().eq("charity_id", charityId);
    if (error) throw error;
    return;
  }
  const { error } = await db
    .from("charity_focus")
    .upsert({ charity_id: charityId, ...row, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "charity_id" });
  if (error) throw error;
}
