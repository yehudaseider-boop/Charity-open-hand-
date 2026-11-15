import { NextResponse, type NextRequest } from "next/server";
import { charityRequestsOpen } from "@/config/app-links";
import { appAccount } from "@/lib/app-auth";
import { saveCharityRequest } from "@/lib/charity-requests-store";
import { clientIp } from "@/lib/client-ip";

/** Whether the phone app shows "Request a charity" (15/11/2026). */
export async function GET() {
  return NextResponse.json({ open: charityRequestsOpen() }, { headers: { "cache-control": "no-store" } });
}

/** A "Request a charity" from the phone app. A signed-in donor's request is kept with their account. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, message: "Check what you typed and try again." }, { status: 400 });
  const account = await appAccount(request).catch(() => null);
  const answer = await saveCharityRequest(
    { name: body.name, town: body.town, link: body.link, note: body.note, emailMe: body.emailMe === true, email: body.email, website: body.website },
    { cameFrom: "app", userId: account?.userId ?? null, ip: clientIp(request.headers) },
  );
  if (answer.ok) return NextResponse.json({ ok: true, message: answer.message, existing: answer.existing ?? null });
  return NextResponse.json({ ok: false, message: answer.message, fieldErrors: answer.fieldErrors ?? null }, { status: answer.status });
}
