import type { NextRequest } from "next/server";

/**
 * The site's own address, for links we send people to (sign-in emails,
 * redirects after sign-in). Taken from SITE_URL, never from request headers,
 * which a visitor can set to point a sign-in link at someone else's site.
 * Without SITE_URL (local development) it falls back to the request. In production a missing
 * SITE_URL is a configuration mistake, and falling back would let a visitor's Origin header
 * choose where sign-in links point, so the call fails instead.
 */
export function siteOrigin(fallback?: string): string {
  const site = process.env.SITE_URL?.replace(/\/+$/, "");
  if (site && /^https?:\/\//.test(site)) return site;
  if (process.env.NODE_ENV === "production") throw new Error("SITE_URL must be set in production. See .env.example.");
  return fallback ?? "";
}

export function requestOrigin(request: NextRequest): string {
  return siteOrigin(request.nextUrl.origin);
}
