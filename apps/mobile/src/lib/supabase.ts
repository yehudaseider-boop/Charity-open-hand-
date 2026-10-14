import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { secureStorage } from "./secure-storage";

/**
 * The app talks to the same database as the website, with the public
 * (publishable) key only. Row-level security decides what a signed-in donor
 * may read: their own donations, receipts and maaser records, nothing else.
 *
 * Until EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are
 * set (once the live project exists), this is null and the app shows sample data.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key && url.startsWith("https://")
    ? createClient(url, key, {
        auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      })
    : null;

// Refresh the session only while the app is open.
if (supabase) {
  AppState.addEventListener("change", (s) => {
    if (s === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
