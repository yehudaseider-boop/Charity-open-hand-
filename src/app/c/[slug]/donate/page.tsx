import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignProgress } from "@/components/campaign-progress";
import { cache } from "react";
import { Card } from "@/components/card";
import { loadOpenCampaigns } from "@/lib/charity/campaign-queries";
import { platformConfig } from "@/config/platform";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { givingKinds } from "@/lib/donations/validation";
import { cleanLabel } from "@/lib/donations/labels";
import { formatRand, parseRandToCents } from "@/lib/money";
import { getViewer } from "@/lib/auth";
import { savedIdLast4 } from "@/lib/donations/saved-id";
import { sourceTag, withSource } from "@/lib/donations/source";
import { cardChargeRates } from "@/lib/donations/card-charge";
import { DonateFlow } from "./donate-flow";

// One lookup serves both the title and the page.
const loadCharity = cache(loadDonatableCharity);

/** A shared campaign link shows the campaign and its charity in WhatsApp's preview. */
export async function generateMetadata({ params, searchParams }: PageProps<"/c/[slug]/donate">): Promise<Metadata> {
  const charity = await loadCharity((await params).slug);
  if (!charity) return { title: "Donate" };
  const sp = await searchParams;
  const campaign = typeof sp.campaign === "string" ? (await loadOpenCampaigns(charity.id)).find((c) => c.id === sp.campaign) : undefined;
  const title = campaign ? `${campaign.title}: give to ${charity.name_en}` : `Give to ${charity.name_en}`;
  const description = campaign?.description?.slice(0, 200) ?? `Give to ${charity.name_en} on Givezy.`;
  return { title: `Give to ${charity.name_en}`, description, openGraph: { title, description, siteName: "Givezy", locale: "en_ZA", type: "website", images: [{ url: "/logo.png" }] } };
}

export default async function DonatePage({ params, searchParams }: PageProps<"/c/[slug]/donate">) {
  const { slug } = await params;
  // The phone app sends the donor here with their label already chosen (older versions send ?kind=).
  const sp = await searchParams;
  const fromApp = sp.from === "app";
  const kind = typeof sp.kind === "string" && Object.hasOwn(givingKinds, sp.kind) ? givingKinds[sp.kind as keyof typeof givingKinds] : null;
  const initialLabel = cleanLabel(sp.label) ?? kind ?? undefined;
  // Trying again after a declined card keeps the amount the donor chose (our links carry it in cents). A
  // phone that sends the amount box before the page has finished loading sends what was typed, in Rand.
  const again =
    typeof sp.cents === "string" && /^\d{1,12}$/.test(sp.cents) ? Number(sp.cents)
    : typeof sp.amount === "string" ? (parseRandToCents(sp.amount.slice(0, 16)) ?? 0)
    : 0;
  const initialAmountCents = again > 0 && again <= platformConfig.maxDonationCents ? again : undefined;
  const charity = await loadCharity(slug);
  if (!charity) notFound();
  // Giving to one of the charity's open campaigns (an ended or unknown one falls back to a normal gift).
  const campaign = typeof sp.campaign === "string" ? (await loadOpenCampaigns(charity.id)).find((c) => c.id === sp.campaign) : undefined;
  const viewer = await getViewer();
  const account = viewer?.email ? { email: viewer.email, savedIdLast4: charity.receiptsAvailable ? await savedIdLast4(viewer.userId) : null } : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-2">
        <Link href={withSource(`/c/${charity.slug}`, sourceTag(sp.src))} className="inline-flex min-h-11 max-w-full items-center text-sm font-semibold text-brand underline underline-offset-4"><span className="truncate">← {charity.name_en}</span></Link>
        <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-[1.05] text-balance">Give to {charity.name_en}</h1>
      </div>
      {campaign && charity.acceptingPayments ? <CampaignProgress campaign={campaign} compact /> : null}
      {typeof sp.campaign === "string" && !campaign ? (
        <Card><p className="text-sm">That campaign has ended. You can still give to {charity.name_en} below.</p></Card>
      ) : null}
      {charity.acceptingPayments ? (
        <DonateFlow
          slug={charity.slug}
          charityName={charity.name_en}
          receiptsAvailable={charity.receiptsAvailable}
          minimumLabel={formatRand(platformConfig.minDonationCents)}
          suggestedCents={charity.suggestedCents}
          impactUnit={charity.impactUnit}
          contributionMinimumLabel={formatRand(platformConfig.minContributionCents)}
          initialLabel={initialLabel}
          initialAmountCents={initialAmountCents}
          fromApp={fromApp}
          campaign={campaign ? { id: campaign.id, title: campaign.title } : undefined}
          account={account}
          source={sourceTag(sp.src)}
          cardChargeAvailable={cardChargeRates() !== null}
        />
      ) : (
        <Card><p className="text-sm">{charity.name_en} isn&apos;t taking online donations yet.</p></Card>
      )}
    </div>
  );
}
