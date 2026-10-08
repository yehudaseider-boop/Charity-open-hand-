import type { NextRequest } from "next/server";

/**
 * The origin the visitor actually used (e.g. https://example.co.za), taken
 * from the Host header. request.url can report "localhost" behind some
 * servers, which would send people to the wrong address and lose their login.
 */
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}
