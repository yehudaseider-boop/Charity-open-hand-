import { NextResponse, type NextRequest } from "next/server";
import { appAccount } from "@/lib/app-auth";
import { logAudit } from "@/lib/audit";
import { hitRateLimit } from "@/lib/rate-limit";
import { decideReceiptDownload, RECEIPT_UNAVAILABLE, type ReceiptForDownload } from "@/lib/receipts/app-download";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A 60-second download link for one of the signed-in donor's own s18A receipts, for the phone app
 * (src/lib/receipts/app-download.ts has the rules). The live session is checked, so a signed-out app gets nothing.
 */
export async function POST(request: NextRequest) {
  const who = await appAccount(request, { forMoney: true });
  if (!who) return NextResponse.json({ ok: false, message: "Please sign in again." }, { status: 401 });
  const limited = await hitRateLimit("app-receipt", [`user:${who.userId}`], 30, 10).catch((e) => (console.error(e), true));
  if (limited) return NextResponse.json({ ok: false, message: "Please wait a moment, then try again." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const db = createAdminClient();
  const load = async (id: string): Promise<ReceiptForDownload | null> => {
    const { data, error } = await db.from("s18a_receipts").select("id, status, pdf_path, charity_id, donors(user_id)").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const donor = (Array.isArray(data.donors) ? data.donors[0] : data.donors) as { user_id: string | null } | null;
    return { id: data.id as string, status: data.status as string, pdfPath: (data.pdf_path as string | null) ?? null, charityId: data.charity_id as string, donorUserId: donor?.user_id ?? null };
  };
  let decision;
  try {
    decision = await decideReceiptDownload(body?.id, who.userId, load);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "We couldn't get your receipt just now. Please try again." }, { status: 503 });
  }
  if (!decision.ok) return NextResponse.json({ ok: false, message: RECEIPT_UNAVAILABLE }, { status: 404 });

  const { data, error } = await db.storage.from("receipts").createSignedUrl(decision.pdfPath, 60, { download: true });
  if (error || !data) return NextResponse.json({ ok: false, message: "We couldn't get your receipt just now. Please try again." }, { status: 503 });
  await logAudit({ actorUserId: who.userId, action: "receipt.downloaded", entityType: "s18a_receipt", entityId: String(body?.id), details: { charity_id: decision.charityId, from: "app" } });
  return NextResponse.json({ ok: true, url: data.signedUrl });
}
