import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
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
  const limited = await hitRateLimit("return-check", [`ip:${clientIp(request.headers)}`], 40, 10).catch(() => false);
  const outcome = limited
    ? ("pending" as const)
    : await confirmPayment(reference).catch((e) => {
        console.error(e);
        return "pending" as const;
      });
  return NextResponse.json({ ok: true, outcome });
}
