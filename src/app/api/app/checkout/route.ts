import { NextResponse, type NextRequest } from "next/server";
import { appCheckoutSchema, appGivingOpen, toCheckoutInput } from "@/lib/donations/app-api";
import { startDonation } from "@/lib/donations/checkout";
import { clientIp } from "@/lib/client-ip";
import { appAccount } from "@/lib/app-auth";

/**
 * Start a gift from the phone app, once-off or monthly: record it as pending (and, for a monthly
 * gift, a pending monthly record and the donor's authorisation) and return the payment
 * provider's own page for the card. With a saved card (switched off until SAVED_CARDS=yes), a once-off gift is
 * charged to that card and there is no page: the app then asks for the outcome. The gift is only marked paid when the provider confirms it
 * (webhook or verification on return), never because the app says so.
 */
export async function POST(request: NextRequest) {
  if (!appGivingOpen()) return NextResponse.json({ ok: false, message: "Giving in the app isn't switched on yet." }, { status: 404 });
  const body = appCheckoutSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    // Say which field, so the app can highlight it: a too-big amount or an over-long ID number, not "check the details".
    const fieldErrors: Record<string, string> = {};
    for (const i of body.error.issues) {
      const key = i.path[0] === "details" ? String(i.path[1] ?? "") : i.path[0] === "giftCents" ? "amount" : i.path[0] === "contributionCents" ? "extra" : "";
      if (!key || fieldErrors[key]) continue;
      fieldErrors[key] = key === "amount" ? "That amount is above the most we can take in the app" : key === "extra" ? "Check your contribution" : "Check this detail";
    }
    return NextResponse.json(
      Object.keys(fieldErrors).length ? { ok: false, message: "Please check the highlighted fields.", fieldErrors } : { ok: false, message: "Check the details and try again." },
      { status: 400 },
    );
  }
  const details = toCheckoutInput(body.data.details);
  if (!details.ok) return NextResponse.json({ ok: false, message: "Please check the highlighted fields.", fieldErrors: details.fieldErrors }, { status: 422 });

  // Saved cards: only for the signed-in donor, checked from their token (and only when switched on, which startDonation checks).
  const account = body.data.saveCard || body.data.useSavedCard || body.data.useSavedId ? ((await appAccount(request, { forMoney: true })) ?? undefined) : undefined;
  if ((body.data.saveCard || body.data.useSavedCard) && !account) {
    return NextResponse.json({ ok: false, message: "Please sign in again to use a saved card." }, { status: 401 });
  }
  const result = await startDonation({
    charitySlug: body.data.slug,
    giftCents: body.data.giftCents,
    contributionCents: body.data.contributionCents,
    coverCardCharge: body.data.coverCardCharge === true,
    shownTotalCents: body.data.shownTotalCents,
    fromApp: true,
    campaignId: body.data.campaignId,
    input: details.input,
    ip: clientIp(request.headers),
    // "Use my ID ending 1234": only for the donor signed in to the app, checked from their token.
    useSavedIdOf: body.data.useSavedId ? account : undefined,
    saveCardFor: body.data.saveCard ? account : undefined,
    useSavedCardOf: body.data.useSavedCard ? account : undefined,
    attemptId: body.data.attemptId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.fieldErrors ? 422 : 409 });
}
