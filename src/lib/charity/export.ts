import "server-only";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { hasSecondStep } from "@/lib/mfa";
import { hitRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Checks that the signed-in person manages this charity (or is a platform admin)
 * and may export again (a few exports every few minutes). Returns the person,
 * or a response to send straight back.
 */
export async function authoriseExport(id: string): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const [{ data: manages }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_charity_admin", { target: id }),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!manages && !isAdmin) return new NextResponse("Not found", { status: 404 });
  if (!(await hasSecondStep())) return new NextResponse("Please complete your second step first.", { status: 403 });
  if (await hitRateLimit("charity-export", [`user:${user.id}`], 10, 10)) {
    return new NextResponse("Too many downloads. Please wait a few minutes and try again.", { status: 429 });
  }
  return { userId: user.id };
}

export function csvResponse(text: string, filename: string) {
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const audit = logAudit;
