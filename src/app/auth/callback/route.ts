import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-path";
import { linkDonorsToUser } from "@/lib/donors/link";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/** A sign-in link lands here (older emails, and Google or Apple sign-in), or the robot's one-time sign-in. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/account";
  const next = safeNextPath(nextParam);

  // A one-time sign-in by its hashed form (`token_hash`), as Supabase's own guides for server sign-in do. Our emails
  // carry no link any more (18/11/2026), so this is used by the end-to-end robot (e2e/), which gets a fresh one from
  // Supabase for its own test account. It is the same one-time sign-in as the emailed code: used once, then gone.
  const tokenHash = searchParams.get("token_hash");
  const viaHash = !code && tokenHash && /^[0-9a-f]{20,200}$/i.test(tokenHash) && ["email", "magiclink"].includes(searchParams.get("type") ?? "");

  if (code || viaHash) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: "email" });
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
