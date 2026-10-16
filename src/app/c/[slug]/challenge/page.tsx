import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { platformConfig } from "@/config/platform";
import { requireViewer } from "@/lib/auth";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { formatRand } from "@/lib/money";
import { startChallenge } from "./actions";
import { ChallengeForm } from "./form";

export const metadata: Metadata = { title: "Start a challenge" };

/** A signed-in donor starts a group challenge for this charity. */
export default async function StartChallengePage({ params }: PageProps<"/c/[slug]/challenge">) {
  const { slug } = await params;
  await requireViewer(`/c/${slug}/challenge`);
  const charity = await loadDonatableCharity(slug);
  if (!charity) notFound();
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/c/${charity.slug}`} className="text-sm font-medium text-brand">← {charity.name_en}</Link>
        <h1 className="mt-1 text-3xl leading-tight">Start a challenge for {charity.name_en}</h1>
      </div>
      <p className="text-muted">
        Set a goal, share the link with friends, family or colleagues, and watch the ring fill up. Every gift goes straight to {charity.name_en}.
        Nobody sees who gave or how much.
      </p>
      {charity.acceptingPayments ? (
        <Card>
          <ChallengeForm action={startChallenge.bind(null, charity.slug)} charityName={charity.name_en} minLabel={formatRand(platformConfig.minDonationCents)} />
        </Card>
      ) : (
        <Card><p className="text-sm">{charity.name_en} isn&apos;t taking online donations yet, so a challenge can&apos;t start yet.</p></Card>
      )}
      <p className="text-xs text-muted">{charity.name_en} is told about your challenge and can stop it if it isn&apos;t right for them.</p>
    </div>
  );
}
