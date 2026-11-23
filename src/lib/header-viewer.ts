import type { DashboardLink } from "@/lib/dashboard-link";

/** What the header shows for the person looking (see app/api/viewer). */
export type HeaderViewer = { signedIn: boolean; dashboards: DashboardLink[] };

/**
 * The sign-in cookies are httpOnly (security hardening 23/11/2026): page scripts can't read them. The header learns
 * "someone is signed in" from this separate marker cookie instead, set next to them (see lib/supabase/auth-cookies.ts).
 * Its value is a random, meaningless string that changes at each sign-in; it holds no token, no id and no email.
 */
export const SIGNED_IN_MARKER = "gz-in";

/** The marker's value in a cookie header (`document.cookie`), or null when nobody is signed in. */
export function signedInMarker(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === SIGNED_IN_MARKER) {
      const v = part.slice(i + 1).trim();
      return v || null;
    }
  }
  return null;
}

/** True when the request carries a Supabase sign-in cookie (the proxy only refreshes a session when there is one). */
export const hasSignInCookie = (names: string[]) => names.some((n) => /^sb-.*-auth-token(?:\.\d+)?$/.test(n));
