// The give page's content (27/11/2026): the real page (page.tsx) and its redesign preview (app/preview/give) share it,
// so the preview loads, checks and sends exactly as the real page does; only the form's look differs.
import { GIVING_PAUSED_MESSAGE } from "@/lib/giving-pause";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignProgress } from "@/components/campaign-progress";
import { cache } from "react";
import { Card } from "@/components/card";
import { loadPublicAllCampaigns, loadPublicDonatable } from "@/lib/charity/public-cache";
import { campaignFromLink } from "@/lib/charity/campaigns";
import { platformConfig } from "@/config/platform";
import { cleanLabel } from "@/lib/donations/labels";
import { formatRand } from "@/lib/money";
import { readGiveLink } from "@/lib/donations/give-link";
import { preselectedAmount } from "@/lib/charity/suggested-amounts";
import { getViewer } from "@/lib/auth";
import { savedIdLast4 } from "@/lib/donations/saved-id";
import { sourceTag, withSource } from "@/lib/donations/source";
import { cardChargeRates } from "@/lib/donations/card-charge";
import { lateDetailsDeadlineForGiftOn } from "@/lib/donations/s18a-details";
import { botCheckSiteKey } from "@/lib/bot-check";
import { DonateFlow } from "./donate-flow";

const loadCharity = cache(loadPublicDonatable);

export async function GivePage({ slug, sp, look = "boxes" }: { slug: string; sp: Record<string, string | string[] | undefined>; look?: "boxes" | "flat" }) {
  // The phone app sends the donor here with their label already chosen (an older version's ?kind= is ignored).
  const fromApp = sp.from === "app";
  const initialLabel = cleanLabel(sp.label) ?? undefined;
  // A give link can preselect the amount and a monthly gift (?amount=250&monthly=1, decided 04/11/2026); trying
  // again after a declined card keeps the amount the donor chose (our links carry it in cents). A silly value is
  // ignored quietly and the page starts as usual.
  const link = readGiveLink(sp, platformConfig);
  // The charity and who is looking, at the same time (19/11/2026: one after the other made this the slowest page).
  const [charity, viewer] = await Promise.all([loadCharity(slug), getViewer()]);
  if (!charity) notFound();
  // Giving to one of the charity's open campaigns (an ended or unknown one falls back to a normal gift, and says
  // which), and the donor's saved ID, also at the same time.
  const [campaigns, savedId] = await Promise.all([
    typeof sp.campaign === "string" ? loadPublicAllCampaigns(charity.slug, charity.id) : Promise.resolve([]),
    viewer?.email && charity.receiptsAvailable ? savedIdLast4(viewer.userId) : Promise.resolve(null),
  ]);
  const fromLink = campaignFromLink(typeof sp.campaign === "string" ? sp.campaign : undefined, campaigns);
  const campaign = fromLink && "campaign" in fromLink ? fromLink.campaign : undefined;
  const campaignProblem = fromLink && "problem" in fromLink ? fromLink.problem : null;
  // Otherwise one of the charity's own amounts starts selected (Givezy never suggests a figure of its own).
  const initialAmountCents = link.amountCents ?? preselectedAmount(charity.suggestedCents, platformConfig);
  const account = viewer?.email ? { email: viewer.email, savedIdLast4: savedId } : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-2">
        <Link href={withSource(`/c/${charity.slug}`, sourceTag(sp.src))} className="inline-flex min-h-11 max-w-full items-center text-sm font-semibold text-brand underline underline-offset-4"><span className="truncate">← <bdi>{charity.name_en}</bdi></span></Link>
        <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-[1.05] text-balance">Give to <bdi>{charity.name_en}</bdi></h1>
      </div>
      {campaign && charity.acceptingPayments ? <CampaignProgress campaign={campaign} compact /> : null}
      {campaignProblem ? (
        <Card>
          <p className="text-sm">
            {campaignProblem === "ended" ? "That campaign has ended." : "We couldn't find that campaign."} You can still give to <bdi>{charity.name_en}</bdi>{charity.acceptingPayments ? " below" : ""}.
          </p>
        </Card>
      ) : null}
      {charity.acceptingPayments ? (
        <DonateFlow
          slug={charity.slug}
          charityName={charity.name_en}
          receiptsAvailable={charity.receiptsAvailable}
          s18aDetailsBy={lateDetailsDeadlineForGiftOn()}
          minimumLabel={formatRand(platformConfig.minDonationCents)}
          suggestedCents={charity.suggestedCents}
          impactUnit={charity.impactUnit}
          contributionMinimumLabel={formatRand(platformConfig.minContributionCents)}
          initialLabel={initialLabel}
          initialAmountCents={initialAmountCents}
          initialMonthly={link.monthly && !campaign}
          fromApp={fromApp}
          campaign={campaign ? { id: campaign.id, title: campaign.title } : undefined}
          account={account}
          source={sourceTag(sp.src)}
          cardChargeAvailable={cardChargeRates() !== null}
          singleAgreementTick={platformConfig.checkout.singleAgreementTick}
          botCheckKey={botCheckSiteKey()}
          look={look}
        />
      ) : charity.givingPaused ? (
        <Card><p role="status" className="text-sm">{GIVING_PAUSED_MESSAGE}</p></Card>
      ) : (
        <Card><p className="text-sm"><bdi>{charity.name_en}</bdi> isn&apos;t taking online donations yet.</p></Card>
      )}
    </div>
  );
}
