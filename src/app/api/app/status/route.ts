import { NextResponse, type NextRequest } from "next/server";
import { appGivingOpen, appStatusSchema } from "@/lib/donations/app-api";
import { confirmPayment } from "@/lib/donations/confirm";
import { confirmationTokenMatches } from "@/lib/donations/confirmation-access";
import { hitRateLimit } from "@/lib/rate-limit";

/**
 * After the payment page closes, the app asks whether the payment went through, so it can thank
 * the donor or keep their form for another try. Only the outcome is returned, never details, and
 * only to the holder of the credential that came with this payment. Asking checks with the
 * payment provider, the same as the website's return page.
 */
export async function POST(request: NextRequest) {
  if (!appGivingOpen()) return NextResponse.json({ ok: false, message: "Giving in the app isn't switched on yet." }, { status: 404 });
  const body = appStatusSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, message: "Something went wrong." }, { status: 400 });
  const { reference, token } = body.data;
  if (!(await confirmationTokenMatches(reference, token))) return NextResponse.json({ ok: false, message: "Donation not found." }, { status: 404 });
  // Per donation: donors behind one shared address (a school's or an office's Wi-Fi) must not block each other.
  const limited = await hitRateLimit("return-check", [`ref:${reference}`], 40, 10).catch(() => false);
  // Busy or an error is "we couldn't check", never "still confirming": the app must not read either as a
  // gift on its way (the donor may have come back from a declined card).
  if (limited) return NextResponse.json({ ok: false, message: "Please wait a moment, then check again." }, { status: 429 });
  let outcome;
  try {
    outcome = await confirmPayment(reference);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "We couldn't check just now. Please check again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, outcome });
}
