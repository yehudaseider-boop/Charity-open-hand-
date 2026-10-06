import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { platformConfig } from "@/config/platform";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { formatRand } from "@/lib/money";
import { DonateFlow } from "./donate-flow";

export const metadata: Metadata = { title: "Donate" };

export default async function DonatePage({ params }: PageProps<"/c/[slug]/donate">) {
  const { slug } = await params;
  const charity = await loadDonatableCharity(slug);
  if (!charity) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/c/${charity.slug}`} className="text-sm text-muted">← {charity.name_en}</Link>
        <h1 className="mt-1 text-xl font-semibold">Give to {charity.name_en}</h1>
        {charity.name_he ? <p lang="he" dir="rtl" className="text-muted">{charity.name_he}</p> : null}
      </div>
      {charity.acceptingPayments ? (
        <DonateFlow
          slug={charity.slug}
          charityName={charity.name_en}
          receiptsAvailable={charity.receiptsAvailable}
          minimumLabel={formatRand(platformConfig.minDonationCents)}
        />
      ) : (
        <Card><p className="text-sm">{charity.name_en} isn&apos;t taking online donations yet.</p></Card>
      )}
    </div>
  );
}
