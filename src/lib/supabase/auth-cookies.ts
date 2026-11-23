import { SIGNED_IN_MARKER } from "@/lib/header-viewer";

/**
 * How the sign-in cookies are set (security hardening 23/11/2026). Supabase keeps a sign-in in sb-<project>-auth-token
 * (split into .0, .1… when long). They are httpOnly, Secure (on the live site) and SameSite=Lax, so no page script can
 * read them. The website never uses Supabase in the browser: every read of the session happens on the server
 * (src/lib/supabase/server.ts, src/proxy.ts). The one thing the browser needs, the header's "is someone signed in",
 * comes from a separate harmless marker cookie ("gz-in": a random string, no token). The phone app signs in with its
 * own storage and never uses these cookies.
 */
const AUTH_COOKIE = /^sb-.*-auth-token(?:\.\d+)?$/;

/** True for Supabase's sign-in cookie (not its short-lived code-verifier cookie). */
export const isAuthCookie = (name: string) => AUTH_COOKIE.test(name);

/** Secure cookies only on the live site: a plain-http local copy could not keep a sign-in with them. */
export function cookiesAreSecure(env: { NODE_ENV?: string; SITE_URL?: string } = process.env): boolean {
  return env.NODE_ENV === "production" && (env.SITE_URL ?? "").startsWith("https://");
}

/** What Supabase's `cookieOptions` gets: the flags every sign-in cookie carries. */
export function authCookieOptions(secure: boolean = cookiesAreSecure()) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
}

const MARKER_SECONDS = 400 * 24 * 60 * 60;

type CookieToSet = { name: string; value: string };
export type MarkerCookie = { name: string; value: string; options: { httpOnly: false; secure: boolean; sameSite: "lax"; path: string; maxAge: number } };

const markerOptions = (secure: boolean, maxAge: number) => ({ httpOnly: false as const, secure, sameSite: "lax" as const, path: "/", maxAge });

/** A new random marker value, one per sign-in. */
const newMarkerValue = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/**
 * The marker cookie to set alongside sign-in cookies being written: a new value when a sign-in is being saved, an
 * emptied (removed) one when the sign-in is being cleared, and nothing when no sign-in cookie is involved.
 */
export function markerForWrite(toSet: readonly CookieToSet[], secure: boolean = cookiesAreSecure()): MarkerCookie | null {
  const auth = toSet.filter((c) => isAuthCookie(c.name));
  if (!auth.length) return null;
  return auth.some((c) => c.value)
    ? { name: SIGNED_IN_MARKER, value: newMarkerValue(), options: markerOptions(secure, MARKER_SECONDS) }
    : { name: SIGNED_IN_MARKER, value: "", options: markerOptions(secure, 0) };
}

/**
 * Keeps the marker in step with the sign-in cookies on a request, without asking Supabase anything: a sign-in with no
 * marker (a person signed in before this change) gets one, and a marker with no sign-in is removed.
 */
export function markerFix(cookies: readonly CookieToSet[], secure: boolean = cookiesAreSecure()): MarkerCookie | null {
  const signedIn = cookies.some((c) => isAuthCookie(c.name) && c.value);
  const marker = cookies.some((c) => c.name === SIGNED_IN_MARKER && c.value);
  if (signedIn && !marker) return { name: SIGNED_IN_MARKER, value: newMarkerValue(), options: markerOptions(secure, MARKER_SECONDS) };
  if (!signedIn && marker) return { name: SIGNED_IN_MARKER, value: "", options: markerOptions(secure, 0) };
  return null;
}
