import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { CharityBadges } from "@/components/charity-badges";
import { canIssue18a } from "@/lib/charities";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { publicImageUrl } from "@/lib/charity/queries";
import { createClient } from "@/lib/supabase/server";

const loadCharity = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charities")
    .select(
      "id, slug, name_en, name_he, legal_name_en, description_en, description_he, website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, is_verified, is_s18a, mandate_signed_at, charity_categories(categories(name_en, name_he))",
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const charity = await loadCharity((await params).slug);
  return charity ? { title: charity.name_en, description: charity.description_en ?? undefined } : {};
}

export default async function CharityPage({ params }: PageProps<"/c/[slug]">) {
  const charity = await loadCharity((await params).slug);
  if (!charity) notFound();
  const logo = publicImageUrl(charity.logo_path);
  const cover = publicImageUrl(charity.cover_path);
  const receipts = canIssue18a(charity);
  const accepting = (await loadDonatableCharity(charity.slug))?.acceptingPayments ?? false;
  const categories = charity.charity_categories
    .map((cc) => cc.categories as unknown as { name_en: string } | null)
    .filter((c): c is { name_en: string } => c !== null);

  return (
    <article className="space-y-4">
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <div className="aspect-[3/1] w-full bg-brand-soft" />
        )}
        <div className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="-mt-12 h-16 w-16 shrink-0 rounded-card border-2 border-surface bg-surface object-cover" />
            ) : null}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{charity.name_en}</h1>
              {charity.name_he ? (
                <p lang="he" dir="rtl" className="text-lg text-muted">{charity.name_he}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CharityBadges charity={charity} />
            {categories.map((c) => <Badge key={c.name_en}>{c.name_en}</Badge>)}
          </div>
          {accepting ? (
            <Link
              href={`/c/${charity.slug}/donate`}
              className="block w-full rounded-control bg-brand px-4 py-3 text-center font-medium text-brand-contrast"
            >
              Donate
            </Link>
          ) : (
            <p className="rounded-control bg-bg p-3 text-center text-sm text-muted">Online giving opens soon.</p>
          )}
          <p className="text-xs text-muted">
            {receipts
              ? "Donations qualify for an s18A tax receipt, issued in this organisation's name."
              : "This organisation is not s18A-approved, so donations do not get a tax receipt."}
          </p>
        </div>
      </div>

      {charity.description_en || charity.description_he ? (
        <Card title="About">
          {charity.description_en ? <p className="whitespace-pre-line text-sm">{charity.description_en}</p> : null}
          {charity.description_he ? (
            <p lang="he" dir="rtl" className="mt-3 whitespace-pre-line text-sm">{charity.description_he}</p>
          ) : null}
        </Card>
      ) : null}

      <Card title="Registration">
        <dl className="space-y-1 text-sm">
          <div><dt className="inline text-muted">Registered name: </dt><dd className="inline">{charity.legal_name_en}</dd></div>
          {charity.npo_number ? <div><dt className="inline text-muted">NPO: </dt><dd className="inline">{charity.npo_number}</dd></div> : null}
          {charity.pbo_number ? <div><dt className="inline text-muted">PBO: </dt><dd className="inline">{charity.pbo_number}</dd></div> : null}
          {charity.website ? (
            <div>
              <dt className="inline text-muted">Website: </dt>
              <dd className="inline break-all"><a href={charity.website} rel="noopener noreferrer nofollow" target="_blank" className="text-brand underline">{charity.website.replace(/^https?:\/\//, "")}</a></dd>
            </div>
          ) : null}
        </dl>
        {charity.is_verified ? (
          <p className="mt-3 text-xs text-muted">Verified: we have checked this organisation&apos;s registration and bank details.</p>
        ) : null}
      </Card>
    </article>
  );
}
