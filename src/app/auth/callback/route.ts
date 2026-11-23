import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-path";
import { linkDonorsForSession } from "@/lib/donors/link";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/** The sign-in link in the email lands here. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/account";
  const next = safeNextPath(nextParam);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Signing in with the emailed link proves they own this email address: attach their past donations. Only for an
      // emailed sign-in with a confirmed email, never a password session (security review 23/11/2026).
      try {
        await linkDonorsForSession(supabase);
      } catch (e) {
        console.error(e instanceof Error ? e.message : e); // never block signing in
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
