import "server-only";
import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { brandColors } from "@/lib/brand-colors";
import { getViewer } from "@/lib/auth";
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
  // The viewer, not just any user: a session started with a password sees nothing (see auth.ts).
  const user = await getViewer();
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return refusal("This download isn't available. You may need to sign in again.", 404, "/login?next=/charity-admin", "Sign in");
  const [{ data: manages }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_charity_admin", { target: id }),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!manages && !isAdmin) return refusal("This download isn't available to you.", 404, "/charity-admin", "Back to your charities");
  if (!(await hasSecondStep())) return refusal("Please complete your second step first, then try the download again.", 403, `/mfa?next=${encodeURIComponent(`/charity-admin/${id}`)}`, "Complete the second step");
  if (await hitRateLimit("charity-export", [`user:${user.userId}`], 10, 10)) {
    return refusal("Too many downloads in a few minutes. Nothing was downloaded. Please wait a few minutes and try again.", 429, `/charity-admin/${id}`, "Back to your dashboard");
  }
  return { userId: user.userId };
}

/**
 * A download that can't go ahead opens a small page in the Givezy look with one way on (30/10/2026),
 * not a bare line of text with no way back. Plain HTML (these are file routes, not pages), coloured from brand-colors.ts.
 */
function refusal(message: string, status: number, href: string, label: string) {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Download not available · Givezy</title></head>
<body style="margin:0;background:${brandColors.surface};color:${brandColors.ink};font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
<main style="max-width:32rem;margin:12vh auto;padding:0 16px">
<p style="margin:0 0 8px;font-weight:700;color:${brandColors.blue}">Givezy</p>
<h1 style="margin:0 0 12px;font-size:1.6rem">Download not available</h1>
<p style="margin:0 0 24px;line-height:1.5;color:${brandColors.muted}">${esc(message)}</p>
<a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border-radius:18px;background:${brandColors.blue};color:${brandColors.surface};font-weight:600;text-decoration:none">${esc(label)}</a>
</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
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

/** An Excel download (see src/lib/xlsx.ts). */
export function xlsxResponse(file: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const audit = logAudit;
