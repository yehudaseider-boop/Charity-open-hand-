import type { Metadata } from "next";
import { cache } from "react";
import { loadPublicDonatable, loadPublicOpenCampaigns } from "@/lib/charity/public-cache";
import { GivePage } from "./give-page";

/**
 * The longest this may run (13/11/2026). The payment provider is given 20 seconds; this leaves room for our own
 * steps, so a slow provider ends in our plain "nothing was charged" message rather than the host cutting it off.
 */
export const maxDuration = 30;

// One lookup serves both the title and the page. The charity's public details are cached for a short while per charity
// and refreshed when it edits them (src/lib/charity/public-cache.ts, 24/11/2026); who is looking, their saved ID and
// everything about the gift itself are read fresh below, and checkout reads the charity live.
const loadCharity = cache(loadPublicDonatable);

/** A shared campaign link shows the campaign and its charity in WhatsApp's preview. */
export async function generateMetadata({ params, searchParams }: PageProps<"/c/[slug]/donate">): Promise<Metadata> {
  const charity = await loadCharity((await params).slug);
  if (!charity) return { title: "Donate" };
  const sp = await searchParams;
  const campaign = typeof sp.campaign === "string" ? (await loadPublicOpenCampaigns(charity.slug, charity.id)).find((c) => c.id === sp.campaign) : undefined;
  const title = campaign ? `${campaign.title}: give to ${charity.name_en}` : `Give to ${charity.name_en}`;
  const description = campaign?.description?.slice(0, 200) ?? `Give to ${charity.name_en} on Givezy.`;
  return { title: `Give to ${charity.name_en}`, description, openGraph: { title, description, siteName: "Givezy", locale: "en_ZA", type: "website", images: [{ url: "/logo.png" }] } };
}

export default async function DonatePage({ params, searchParams }: PageProps<"/c/[slug]/donate">) {
  return <GivePage slug={(await params).slug} sp={await searchParams} />;
}
