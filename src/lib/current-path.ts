import { headers } from "next/headers";
import { safeNextPath } from "@/lib/safe-path";

/** Set by src/proxy.ts on every page request: the path and query the person actually asked for. */
export const CURRENT_PATH_HEADER = "x-givezy-path";

/**
 * Where to send someone back to after sign-in or the second step. Pages name the page they are on
 * (`/charity-admin/<id>/donations`), but shared helpers only know the area (`/charity-admin/<id>`),
 * and neither knows the filters in the query. So when the request's own path is inside the page or
 * area given, it wins: deep links and filters survive the detour. Anything else keeps what was given.
 */
export function resolveNext(given: string, requested: string | null | undefined): string {
  const safe = safeNextPath(given);
  if (!requested) return safe;
  const req = safeNextPath(requested, "");
  if (!req) return safe;
  const givenPath = safe.split("?")[0];
  const reqPath = req.split("?")[0];
  const inside = reqPath === givenPath || reqPath.startsWith(givenPath.endsWith("/") ? givenPath : `${givenPath}/`);
  return inside ? req : safe;
}

/** `resolveNext` for the current request. */
export async function currentNext(given: string): Promise<string> {
  const h = await headers();
  return resolveNext(given, h.get(CURRENT_PATH_HEADER));
}
