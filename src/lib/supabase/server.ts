import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./env";
import { authCookieOptions, markerForWrite } from "./auth-cookies";

/**
 * Supabase client acting as the signed-in visitor (or anonymous).
 * Row-level security applies to everything it reads and writes.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    // httpOnly, Secure (live site), SameSite=Lax: page scripts can't read the sign-in (23/11/2026).
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          // The header's "signed in" marker moves with the sign-in cookies (the only cookie a page script may read).
          const marker = markerForWrite(toSet);
          if (marker) cookieStore.set(marker.name, marker.value, marker.options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session instead.
        }
      },
    },
  });
}
