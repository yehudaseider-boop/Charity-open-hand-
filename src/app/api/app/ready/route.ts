import { NextResponse, type NextRequest } from "next/server";
import { platformConfig } from "@/config/platform";
import { appGivingOpen, appReadySchema, savedCardsOpen } from "@/lib/donations/app-api";
import { loadSavedCardInfo } from "@/lib/donations/saved-card";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { loadOpenCampaign } from "@/lib/donations/checkout";
import { appAccount } from "@/lib/app-auth";
import { savedIdLast4 as savedIdLast4For } from "@/lib/donations/saved-id";

/**
 * Asked by the app's give screen before the donor fills anything in: is giving in the app open,
 * can this charity take a payment now, is the chosen campaign still running, and what are the
 * minimums. A 404 means the app should send the donor to the website instead.
 */
export async function POST(request: NextRequest) {
  if (!appGivingOpen()) return NextResponse.json({ ok: false, message: "Giving in the app isn't switched on yet." }, { status: 404 });
  const body = appReadySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false, message: "Something went wrong. Please try again." }, { status: 400 });
  const charity = await loadDonatableCharity(body.data.slug);
  const accepting = Boolean(charity?.acceptingPayments);
  const campaignOpen = charity && body.data.campaignId ? Boolean(await loadOpenCampaign(body.data.campaignId, charity.id)) : false;
  // A signed-in donor sees "Use my ID ending 1234" (the last four digits only).
  const account = await appAccount(request);
  const who = charity?.receiptsAvailable ? account : null;
  const savedIdLast4 = who ? await savedIdLast4For(who.userId) : null;
  // Saved cards, when switched on: offer to keep a card, or pay with the one kept (brand and last four digits only).
  const cardsOpen = savedCardsOpen();
  const savedCard = cardsOpen && account ? await loadSavedCardInfo(account.userId) : null;
  return NextResponse.json({
    ok: true,
    accepting,
    receiptsAvailable: Boolean(charity?.receiptsAvailable),
    campaignOpen,
    minGiftCents: platformConfig.minDonationCents,
    minContributionCents: platformConfig.minContributionCents,
    savedIdLast4,
    savedCardsOpen: cardsOpen,
    savedCard,
  });
}
