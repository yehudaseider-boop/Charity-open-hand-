import { NextResponse, type NextRequest } from "next/server";
import { linkDonorsToUser } from "@/lib/donors/link";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/** The sign-in link in the email lands here. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/account";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/account";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Signing in proves they own this email address: attach their past donations.
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        try {
          await linkDonorsToUser(user.id, user.email);
        } catch (e) {
          console.error(e instanceof Error ? e.message : e); // never block signing in
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
