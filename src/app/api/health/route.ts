import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * For an uptime monitor: is the website up and can it reach the database? Says nothing else.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await createAdminClient().from("charities").select("id", { head: true, count: "exact" }).limit(1);
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
