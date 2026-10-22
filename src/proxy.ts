import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { demoModeOn, isDemoPath } from "@/lib/demo/mode";

/** Keeps the Supabase login session fresh on every page request. */
export async function proxy(request: NextRequest) {
  const demo = demoModeOn();
  const path = request.nextUrl.pathname;
  // The demo's own pages do not exist unless demo mode is on (they are not even built: next.config.ts).
  if (!demo && isDemoPath(path)) return new NextResponse("Not found", { status: 404 });
  // The demo signs people in with one click. The emailed sign-in code is not used there: nobody
  // should type a real address into a demo and be sent an email.
  if (demo && path === "/login") return NextResponse.redirect(new URL("/demo", request.url));

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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
