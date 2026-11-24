import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CURRENT_PATH_HEADER } from "@/lib/current-path";
import { SOURCE_PARAM } from "@/lib/donations/source";
import { FOCUS_COOKIE, FOCUS_SECONDS, focusChange } from "@/lib/focus";
import { backslashRedirect, canonicalRedirect } from "@/lib/canonical-host";
import { COMING_SOON_ROUTE, comingSoonAction, staysOnComingSoonHost } from "@/lib/coming-soon";
import { charitySignUpOpen, launchListOpen } from "@/config/app-links";
import { audienceRedirect } from "@/lib/audience";
import { hasSignInCookie } from "@/lib/header-viewer";
import { buildCsp, cspPolicyFor, newNonce } from "@/lib/csp";
import { checkoutOrigins } from "@/lib/gateway/checkout-origins";
import { VIDEO_FRAME_ORIGINS } from "@/lib/charity/video";
import { authCookieOptions, markerFix, markerForWrite } from "@/lib/supabase/auth-cookies";

/** Keeps the Supabase login session fresh on every page request. */
export async function proxy(request: NextRequest) {
  const deployed = process.env.VERCEL_ENV === "production";
  // "Coming soon" addresses (COMING_SOON_HOSTS, 11/11/2026) show one landing page and nothing else. First, so such an
  // address is never moved on to SITE_URL below. Unset, or on any other address, this does nothing.
  const signUp = charitySignUpOpen();
  const listOpen = launchListOpen();
  const soon = comingSoonAction(request.nextUrl, request.method, process.env.COMING_SOON_HOSTS, deployed, { signUp, policies: signUp || listOpen, launchList: listOpen }, request.headers.has("next-action"));
  if (soon === "not-found") return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (soon === "redirect-home") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home, 307);
  }
  if (soon === "serve") {
    const to = request.nextUrl.clone();
    to.pathname = COMING_SOON_ROUTE;
    to.search = "";
    return NextResponse.rewrite(to);
  }
  // Every page on one address, so a sign-in link always lands where it was asked for.
  // Never from a coming-soon address: its open pages stay on it, so a visitor is never sent on to the test site
  // (19/11/2026: Privacy on givezy.co.za went to test.givezy.co.za, and its menu into the full test site).
  const onSoonHost = staysOnComingSoonHost(request.nextUrl, process.env.COMING_SOON_HOSTS, deployed);
  const moveTo = onSoonHost ? null : canonicalRedirect(request.nextUrl, request.method, process.env.SITE_URL, deployed);
  // Temporary (307), so browsers do not remember it if SITE_URL later moves to our own domain.
  if (moveTo) return NextResponse.redirect(moveTo, 307);
  // A stray backslash in the address goes to the same address without it (the hosting crashed on it otherwise).
  const cleaned = backslashRedirect(request.nextUrl, request.method);
  if (cleaned) return NextResponse.redirect(new URL(cleaned, request.nextUrl), 308);
  // A shared "?for=charity" or "?for=give" link opens the right side of the site (home or For charities).
  const side = audienceRedirect(request.nextUrl, request.method);
  if (side) return NextResponse.redirect(side, 307);
  // Tell the page which path (with its query) was asked for, so a detour via sign-in or the second
  // step can come back to it. Set here, never trusted from the browser.
  request.headers.set(CURRENT_PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  // Pages that handle sign-in, money or personal data get a script policy with a one-time nonce (23/11/2026, see
  // lib/csp.ts for which). Next.js reads the nonce from the request's own policy header and puts it on its scripts.
  // Every other page keeps the policy from next.config.ts, which scripts built ahead of time can run under.
  let nonceCsp: string | null = null;
  if (cspPolicyFor(request.nextUrl.pathname) === "nonce") {
    const nonce = newNonce();
    nonceCsp = buildCsp({
      nonce,
      dev: process.env.NODE_ENV === "development",
      supabaseOrigin: originOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
      formActionOrigins: checkoutOrigins(process.env.PAYMENT_GATEWAY),
      videoFrameOrigins: VIDEO_FRAME_ORIGINS,
    });
    request.headers.set("Content-Security-Policy", nonceCsp);
    request.headers.set("x-nonce", nonce);
  }
  // The plain charities list (no search, no cause) is built ahead and served from cache: the page is the same for
  // everyone, so it is sent to its cached twin. The address in the browser stays /charities. Other parameters
  // (utm_source, fbclid, a share code) change nothing on the page, so they don't stop it.
  const query = request.nextUrl.searchParams;
  const plainList = (request.method === "GET" || request.method === "HEAD") && request.nextUrl.pathname === "/charities" && !query.has("q") && !query.has("category");
  const start = () => {
    if (!plainList) return NextResponse.next({ request });
    const to = request.nextUrl.clone();
    to.pathname = "/browse-charities";
    return NextResponse.rewrite(to, { request });
  };
  let response = start();

  // Nobody signed in (most visitors): no session to refresh, so no trip to Supabase before the page (09/11/2026).
  if (hasSignInCookie(request.cookies.getAll().map((c) => c.name))) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        // httpOnly, Secure (live site), SameSite=Lax: page scripts can't read the sign-in (23/11/2026).
        cookieOptions: authCookieOptions(),
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet) => {
            toSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = start();
            toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            const marker = markerForWrite(toSet);
            if (marker) response.cookies.set(marker.name, marker.value, marker.options);
          },
        },
      },
    );

    // Do not remove: this call renews a session that has expired or is within 90 seconds of it (it writes the new
    // cookies above). The token's signature is checked here, with no trip to Supabase's sign-in service (24/11/2026:
    // was getUser, about 170 ms on every signed-in request). The proxy decides nothing about access; every page and
    // action still asks Supabase whether the sign-in is live (getViewer), so a revoked session is refused there.
    await supabase.auth.getClaims();
  }

  // A person signed in before the sign-in cookies went httpOnly has no "signed in" marker yet (and one whose sign-in
  // has gone should not keep it): no trip to Supabase, just the cookies as they are on this request.
  const fix = markerFix(request.cookies.getAll());
  if (fix) response.cookies.set(fix.name, fix.value, fix.options);

  // A charity's own link (button, share, QR) keeps the visit on that charity; the home page or the
  // charities list ends it.
  const focus = focusChange(request.nextUrl.pathname, request.nextUrl.searchParams.get(SOURCE_PARAM));
  if (focus === "clear") {
    if (request.cookies.has(FOCUS_COOKIE)) response.cookies.delete(FOCUS_COOKIE);
  } else if (focus) {
    response.cookies.set(FOCUS_COOKIE, focus.set, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: FOCUS_SECONDS, path: "/" });
  }
  if (nonceCsp) response.headers.set("Content-Security-Policy", nonceCsp);
  return response;
}

/** The origin of an address, or "" when it isn't one. */
function originOf(address: string | undefined): string {
  try {
    return address ? new URL(address).origin : "";
  } catch {
    return "";
  }
}

export const config = {
  // Skips only the real static files (19/11/2026). Before, any address ending in .png or .svg skipped the proxy, so
  // givezy.co.za/demo/dashboard/x.png showed a full page past the coming-soon rules.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|home/|app-preview/|logo\\.png$).*)"],
};
