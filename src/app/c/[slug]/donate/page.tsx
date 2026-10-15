import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignProgress } from "@/components/campaign-progress";
import { Card } from "@/components/card";
import { loadOpenCampaigns } from "@/lib/charity/campaign-queries";
import { platformConfig } from "@/config/platform";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { givingKinds } from "@/lib/donations/validation";
import { formatRand } from "@/lib/money";
import { DonateFlow } from "./donate-flow";

export const metadata: Metadata = { title: "Donate" };

export default async function DonatePage({ params, searchParams }: PageProps<"/c/[slug]/donate">) {
  const { slug } = await params;
  // The phone app sends the donor here with their maaser, chomesh or tzedaka choice already made.
  const sp = await searchParams;
  const kind = sp.kind;
  const fromApp = sp.from === "app";
  const initialKind = typeof kind === "string" && Object.hasOwn(givingKinds, kind) ? (kind as keyof typeof givingKinds) : undefined;
  const charity = await loadDonatableCharity(slug);
  if (!charity) notFound();
  // Giving to one of the charity's open campaigns (an ended or unknown one falls back to a normal gift).
  const campaign = typeof sp.campaign === "string" ? (await loadOpenCampaigns(charity.id)).find((c) => c.id === sp.campaign) : undefined;

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/c/${charity.slug}`} className="text-sm text-muted">← {charity.name_en}</Link>
        <h1 className="mt-1 text-xl font-semibold">Give to {charity.name_en}</h1>
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
          initialKind={initialKind}
          fromApp={fromApp}
          campaign={campaign ? { id: campaign.id, title: campaign.title } : undefined}
        />
      ) : (
        <Card><p className="text-sm">{charity.name_en} isn&apos;t taking online donations yet.</p></Card>
      )}
    </div>
  );
}
