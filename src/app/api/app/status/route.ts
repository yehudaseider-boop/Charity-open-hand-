import { NextResponse, type NextRequest } from "next/server";
import { appGivingOpen, appStatusSchema } from "@/lib/donations/app-api";
import { confirmPayment } from "@/lib/donations/confirm";
import { confirmationAccess } from "@/lib/donations/confirmation-access";
import { clientIp } from "@/lib/client-ip";
import { hitRateLimit, ipKeys } from "@/lib/rate-limit";

/** The longest this may run (13/11/2026): checking a payment with the provider can take up to 20 seconds. */
export const maxDuration = 60;

/** A once-off payment the provider has never received this long after it was started is closed as failed. */
const NEVER_RECEIVED_AFTER_MS = 15 * 60_000;

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
  // A generous limit per internet address before the token is looked up (security review 18/11/2026; generous, because many phones share one address on mobile networks); the limit per
  // donation below still applies.
  if (await hitRateLimit("app-status-ip", ipKeys(clientIp(request.headers)), 600, 10).catch(() => false)) {
    return NextResponse.json({ ok: false, message: "Please wait a moment, then check again." }, { status: 429 });
  }
  const access = await confirmationAccess(reference, token);
  // The right link past its 30 days (23/11/2026): only its holder hears that it has expired, so the app can say so and
  // stop asking. Nothing about the gift is said. Anyone else (no link, a wrong one, an unknown gift) still gets "not found".
  if (access === "expired") return NextResponse.json({ ok: false, expired: true, message: "This gift's check link has expired." }, { status: 410 });
  if (access !== "valid") return NextResponse.json({ ok: false, message: "Donation not found." }, { status: 404 });
  // Per donation: donors behind one shared address (a school's or an office's Wi-Fi) must not block each other.
  // A check that fails counts as limited (never as a free pass to ask the payment provider).
  const limited = await hitRateLimit("return-check", [`ref:${reference}`], 40, 10).catch((e) => (console.error(e), true));
  // Busy or an error is "we couldn't check", never "still confirming": the app must not read either as a
  // gift on its way (the donor may have come back from a declined card).
  if (limited) return NextResponse.json({ ok: false, message: "Please wait a moment, then check again." }, { status: 429 });
  let outcome;
  try {
    // A once-off payment the provider has still never received 15 minutes on is closed: nothing was charged, and
    // the app can stop asking (it would otherwise say "we couldn't check" for ever).
    outcome = await confirmPayment(reference, { closeNeverReceivedBefore: new Date(Date.now() - NEVER_RECEIVED_AFTER_MS) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, message: "We couldn't check just now. Please check again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, outcome });
}
