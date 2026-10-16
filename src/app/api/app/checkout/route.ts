import { NextResponse, type NextRequest } from "next/server";
import { appCheckoutSchema, appGivingOpen, toCheckoutInput } from "@/lib/donations/app-api";
import { startDonation } from "@/lib/donations/checkout";
import { clientIp } from "@/lib/client-ip";
import { appAccount } from "@/lib/app-auth";

/**
 * Start a gift from the phone app, once-off or monthly: record it as pending (and, for a monthly
 * gift, a pending monthly record and the donor's authorisation) and return the payment
 * provider's own page for the card. The gift is only marked paid when the provider confirms it
 * (webhook or verification on return), never because the app says so.
 */
export async function POST(request: NextRequest) {
  if (!appGivingOpen()) return NextResponse.json({ ok: false, message: "Giving in the app isn't switched on yet." }, { status: 404 });
  const body = appCheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, message: "Check the details and try again." }, { status: 400 });
  const details = toCheckoutInput(body.data.details);
  if (!details.ok) return NextResponse.json({ ok: false, message: "Please check the highlighted fields.", fieldErrors: details.fieldErrors }, { status: 422 });

  const result = await startDonation({
    charitySlug: body.data.slug,
    giftCents: body.data.giftCents,
    contributionCents: body.data.contributionCents,
    shownTotalCents: body.data.shownTotalCents,
    fromApp: true,
    campaignId: body.data.campaignId,
    input: details.input,
    ip: clientIp(request.headers),
    // "Use my ID ending 1234": only for the donor signed in to the app, checked from their token.
    useSavedIdOf: body.data.useSavedId ? ((await appAccount(request)) ?? undefined) : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.fieldErrors ? 422 : 409 });
}
