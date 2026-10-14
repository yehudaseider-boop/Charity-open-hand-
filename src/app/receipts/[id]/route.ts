import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens an s18A receipt PDF through a 60-second signed link. Row-level
 * security decides who may see the receipt: its donor, that charity's admins
 * and platform admins. Withdrawn (void) receipts are not handed out.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/receipts/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const { data: receipt } = await supabase
    .from("s18a_receipts")
    .select("id, charity_id, status, pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (!receipt || receipt.status !== "issued" || !receipt.pdf_path) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await createAdminClient().storage.from("receipts").createSignedUrl(receipt.pdf_path, 60, { download: true });
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  await logAudit({
    actorUserId: user.id,
    action: "receipt.downloaded",
    entityType: "s18a_receipt",
    entityId: receipt.id,
    details: { charity_id: receipt.charity_id },
  });
  return NextResponse.redirect(data.signedUrl);
}
