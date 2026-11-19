import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/request-origin";
import { fromThisSite } from "@/lib/same-site";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  // Only from our own pages: another site can't sign someone out (security review 18/11/2026).
  if (!fromThisSite(request.headers)) return NextResponse.redirect(`${requestOrigin(request)}/`, { status: 303 });
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${requestOrigin(request)}/`, { status: 303 });
}
