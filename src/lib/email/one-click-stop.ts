import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";

/**
 * The one-click stop a mail app sends (RFC 8058): a POST to the address in List-Unsubscribe, with the
 * same token as the stop link in the email. It stops exactly what that link's button stops. A short
 * plain answer, as mail apps read nothing else. Opening the address (GET) changes nothing: it goes to
 * the page that asks first, so an email scanner following links stops nobody.
 */
const plain = (body: string, status: number) => new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function oneClickStop(request: NextRequest, stop: (token: string) => Promise<boolean>): Promise<NextResponse> {
  // Mail providers send these from shared servers, so an address gets a wide allowance.
  const limited = await hitRateLimit("one-click-stop", ipKeys(clientIp(request.headers)), 120, 10).catch((e) => {
    console.error(e);
    return null;
  });
  if (limited === null) return plain("Something went wrong. Nothing was changed. Please try again later.", 503);
  if (limited) return plain("Too many tries. Nothing was changed. Please try again later.", 429);
  const token = request.nextUrl.searchParams.get("t") ?? "";
  let ok: boolean;
  try {
    ok = await stop(token);
  } catch (e) {
    console.error(e);
    return plain("Something went wrong. Nothing was changed. Please try again later.", 503);
  }
  // The same answer for a link that was never ours and one that is malformed.
  if (!ok) return plain("That link didn't work. Nothing was changed.", 400);
  return plain("Done. You won't get these emails any more.", 200);
}

/** Opening the address in a browser: the page that asks first, with the same token. */
export function toStopPage(request: NextRequest, page: "/news/stop" | "/thanks/stop"): NextResponse {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const url = new URL(page, process.env.SITE_URL || request.nextUrl.origin);
  if (token) url.searchParams.set("t", token);
  const res = NextResponse.redirect(url, 303);
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
