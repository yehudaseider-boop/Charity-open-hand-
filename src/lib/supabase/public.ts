import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for public pages, acting as an anonymous visitor and never reading the request's cookies.
 * Row-level security applies as it does for anyone not signed in. Because it doesn't read the request, a page
 * that uses only this can be built once and served from Vercel's cache near the visitor (09/11/2026).
 */
export function createPublicClient() {
  return createSupabaseClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
