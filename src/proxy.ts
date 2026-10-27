import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CURRENT_PATH_HEADER } from "@/lib/current-path";
import { SOURCE_PARAM } from "@/lib/donations/source";
import { FOCUS_COOKIE, FOCUS_SECONDS, focusChange } from "@/lib/focus";
import { canonicalRedirect } from "@/lib/canonical-host";

/** Keeps the Supabase login session fresh on every page request. */
export async function proxy(request: NextRequest) {
  // Every page on one address, so a sign-in link always lands where it was asked for.
  const moveTo = canonicalRedirect(request.nextUrl, request.method, process.env.SITE_URL, process.env.VERCEL_ENV === "production");
  // Temporary (307), so browsers do not remember it if SITE_URL later moves to our own domain.
  if (moveTo) return NextResponse.redirect(moveTo, 307);
  // Tell the page which path (with its query) was asked for, so a detour via sign-in or the second
  // step can come back to it. Set here, never trusted from the browser.
  request.headers.set(CURRENT_PATH_HEADER, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Do not remove: this call refreshes an expired session.
  await supabase.auth.getUser();

  // A charity's own link (button, share, QR) keeps the visit on that charity; the home page or the
  // charities list ends it.
  const focus = focusChange(request.nextUrl.pathname, request.nextUrl.searchParams.get(SOURCE_PARAM));
  if (focus === "clear") {
    if (request.cookies.has(FOCUS_COOKIE)) response.cookies.delete(FOCUS_COOKIE);
  } else if (focus) {
    response.cookies.set(FOCUS_COOKIE, focus.set, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: FOCUS_SECONDS, path: "/" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
