import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a charity document through a 60-second signed link. Row-level
 * security decides who may see it: that charity's admins and platform admins.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/documents/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const { data: doc } = await supabase
    .from("charity_documents")
    .select("id, charity_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage.from("charity-documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data) return new NextResponse("Not found", { status: 404 });

  await logAudit({
    actorUserId: user.id,
    action: "charity.document_viewed",
    entityType: "charity_document",
    entityId: doc.id,
    details: { charity_id: doc.charity_id },
  });
  return NextResponse.redirect(data.signedUrl);
}
