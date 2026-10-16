import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignProgress } from "@/components/campaign-progress";
import { Card } from "@/components/card";
import { loadOpenCampaigns } from "@/lib/charity/campaign-queries";
import { platformConfig } from "@/config/platform";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { givingKinds } from "@/lib/donations/validation";
import { cleanLabel } from "@/lib/donations/labels";
import { formatRand } from "@/lib/money";
import { getViewer } from "@/lib/auth";
import { savedIdLast4 } from "@/lib/donations/saved-id";
import { DonateFlow } from "./donate-flow";

/** A shared campaign link shows the campaign and its charity in WhatsApp's preview. */
export async function generateMetadata({ params, searchParams }: PageProps<"/c/[slug]/donate">): Promise<Metadata> {
  const charity = await loadDonatableCharity((await params).slug);
  if (!charity) return { title: "Donate" };
  const sp = await searchParams;
  const campaign = typeof sp.campaign === "string" ? (await loadOpenCampaigns(charity.id)).find((c) => c.id === sp.campaign) : undefined;
  const title = campaign ? `${campaign.title}: give to ${charity.name_en}` : `Give to ${charity.name_en}`;
  const description = campaign?.description?.slice(0, 200) ?? `Give to ${charity.name_en} on Givezy.`;
  return { title: "Donate", description, openGraph: { title, description, siteName: "Givezy", locale: "en_ZA", type: "website", images: [{ url: "/logo.png" }] } };
}

export default async function DonatePage({ params, searchParams }: PageProps<"/c/[slug]/donate">) {
  const { slug } = await params;
  // The phone app sends the donor here with their label already chosen (older versions send ?kind=).
  const sp = await searchParams;
  const fromApp = sp.from === "app";
  const kind = typeof sp.kind === "string" && Object.hasOwn(givingKinds, sp.kind) ? givingKinds[sp.kind as keyof typeof givingKinds] : null;
  const initialLabel = cleanLabel(sp.label) ?? kind ?? undefined;
  const charity = await loadDonatableCharity(slug);
  if (!charity) notFound();
  // Giving to one of the charity's open campaigns (an ended or unknown one falls back to a normal gift).
  const campaign = typeof sp.campaign === "string" ? (await loadOpenCampaigns(charity.id)).find((c) => c.id === sp.campaign) : undefined;
  const viewer = await getViewer();
  const account = viewer?.email ? { email: viewer.email, savedIdLast4: charity.receiptsAvailable ? await savedIdLast4(viewer.userId) : null } : undefined;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/c/${charity.slug}`} className="text-sm font-medium text-brand">← {charity.name_en}</Link>
        <h1 className="mt-1 text-3xl leading-tight">Give to {charity.name_en}</h1>
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
          contributionMinimumLabel={formatRand(platformConfig.minContributionCents)}
          initialLabel={initialLabel}
          fromApp={fromApp}
          campaign={campaign ? { id: campaign.id, title: campaign.title } : undefined}
          account={account}
        />
      ) : (
        <Card><p className="text-sm">{charity.name_en} isn&apos;t taking online donations yet.</p></Card>
      )}
    </div>
  );
}
