import type { DashboardLink } from "@/lib/dashboard-link";

/** What the header shows for the person looking (see app/api/viewer). */
export type HeaderViewer = { signedIn: boolean; dashboards: DashboardLink[] };

/** Supabase keeps a sign-in in a cookie named sb-<project>-auth-token (split into .0, .1… when long). */
const AUTH_COOKIE = /(?:^|;\s*)(sb-[^=;]*-auth-token(?:\.\d+)?)=([^;]*)/g;

/**
 * A short fingerprint of the sign-in cookies in `cookieHeader`, or null when nobody is signed in. Used to tell
 * whether the sign-in changed since the header last asked, without keeping a copy of the token itself.
 */
export function signInFingerprint(cookieHeader: string): string | null {
  const parts = [...cookieHeader.matchAll(AUTH_COOKIE)].filter((m) => m[2]).map((m) => `${m[1]}=${m[2]}`);
  if (!parts.length) return null;
  let h = 5381;
  for (const ch of parts.sort().join(";")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** True when the request carries a Supabase sign-in cookie (the proxy only refreshes a session when there is one). */
export const hasSignInCookie = (names: string[]) => names.some((n) => /^sb-.*-auth-token(?:\.\d+)?$/.test(n));
