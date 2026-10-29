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
  // A receipt that can't be handed out goes back to the account page with a plain message, not a bare "Not found".
  const unavailable = () => NextResponse.redirect(new URL("/account?receipt=unavailable", _request.url), { status: 303 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return unavailable();
  // An expired session gets the sign-in page, not a bare line of text.
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/receipts/${id}`)}`, _request.url), { status: 303 });

  const { data: receipt } = await supabase
    .from("s18a_receipts")
    .select("id, charity_id, status, pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (!receipt || receipt.status !== "issued" || !receipt.pdf_path) return unavailable();

  const { data, error } = await createAdminClient().storage.from("receipts").createSignedUrl(receipt.pdf_path, 60, { download: true });
  if (error || !data) return unavailable();

  await logAudit({
    actorUserId: user.id,
    action: "receipt.downloaded",
    entityType: "s18a_receipt",
    entityId: receipt.id,
    details: { charity_id: receipt.charity_id },
  });
  return NextResponse.redirect(data.signedUrl);
}
