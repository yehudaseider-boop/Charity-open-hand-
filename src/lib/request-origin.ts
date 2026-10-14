import type { NextRequest } from "next/server";

/**
 * The site's own address, for links we send people to (sign-in emails,
 * redirects after sign-in). Taken from SITE_URL, never from request headers,
 * which a visitor can set to point a sign-in link at someone else's site.
 * Without SITE_URL (local development) it falls back to the request.
 */
export function siteOrigin(fallback?: string): string {
  const site = process.env.SITE_URL?.replace(/\/+$/, "");
  if (site && /^https?:\/\//.test(site)) return site;
  return fallback ?? "";
}

export function requestOrigin(request: NextRequest): string {
  return siteOrigin(request.nextUrl.origin);
}
