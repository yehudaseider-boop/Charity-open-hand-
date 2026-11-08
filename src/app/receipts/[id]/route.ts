import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { signedInWithPassword } from "@/lib/auth";
import { requestOrigin } from "@/lib/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** The pages that show the "receipt unavailable" notice: a donor's account, the admin list, a charity's list. */
const LIST_PAGES = [/^\/account$/, /^\/admin\/receipts$/, /^\/charity-admin\/[0-9a-f-]{36}\/receipts$/i];

/**
 * Where a receipt that can't be handed out sends the person: back to the list they opened it from, if the
 * Referer names one of the three pages that show the notice; otherwise the account page. Only the path is
 * taken from the Referer, never the address, so a forged header can't send anyone elsewhere.
 */
function unavailableBackPath(referer: string | null): string {
  try {
    const path = referer ? new URL(referer).pathname : "";
    return LIST_PAGES.some((p) => p.test(path)) ? path : "/account";
  } catch {
    return "/account";
  }
}

/**
 * Opens an s18A receipt PDF through a 60-second signed link. Row-level
 * security decides who may see the receipt: its donor, that charity's admins
 * and platform admins. Withdrawn (void) receipts are not handed out.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/receipts/[id]">) {
  const { id } = await ctx.params;
  // A receipt that can't be handed out goes back to a list page with a plain message, not a bare "Not found".
  const origin = requestOrigin(request);
  const unavailable = () => {
    const to = new URL(unavailableBackPath(request.headers.get("referer")), origin);
    to.searchParams.set("receipt", "unavailable");
    return NextResponse.redirect(to, { status: 303 });
  };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return unavailable();
  // An expired session gets the sign-in page, not a bare line of text. So does a session started with a password:
  // Givezy signs people in with an emailed code only, like every other page (see getViewer).
  if (!user || (await signedInWithPassword(supabase))) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/receipts/${id}`)}`, origin), { status: 303 });

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
