import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@/components/badge";
import { CampaignProgress } from "@/components/campaign-progress";
import { Card } from "@/components/card";
import { CharityBadges } from "@/components/charity-badges";
import { Info } from "@/components/info";
import { canIssue18a } from "@/lib/charities";
import { loadDonatableCharity } from "@/lib/donations/charity";
import { sourceTag, withSource } from "@/lib/donations/source";
import { initials } from "@/lib/charity/initials";
import { loadStories, publicImageUrl } from "@/lib/charity/queries";
import { loadOpenCampaigns } from "@/lib/charity/campaign-queries";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const loadCharity = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charities")
    .select(
      "id, slug, name_en, legal_name_en, description_en, funds_use_en, impact_en, website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, suburb, city, is_verified, is_s18a, mandate_signed_at, charity_categories(categories(name_en))",
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const charity = await loadCharity((await params).slug);
  if (!charity) return {};
  // What WhatsApp and other apps show when someone shares the page: name, a line about the work, the cover photo.
  const image = publicImageUrl(charity.cover_path) ?? publicImageUrl(charity.logo_path);
  const description = charity.description_en?.slice(0, 200) ?? `Give to ${charity.name_en} on Givezy.`;
  return {
    title: charity.name_en,
    description,
    openGraph: { title: `Give to ${charity.name_en}`, description, siteName: "Givezy", locale: "en_ZA", type: "website", images: [{ url: image ?? "/logo.png" }] },
  };
}

export default async function CharityPage({ params, searchParams }: PageProps<"/c/[slug]">) {
  // A shared link or the QR poster tags the page (?src=); the Give links pass it on to the gift.
  const src = sourceTag((await searchParams).src);
  const charity = await loadCharity((await params).slug);
  if (!charity) notFound();
  const logo = publicImageUrl(charity.logo_path);
  const cover = publicImageUrl(charity.cover_path);
  const receipts = canIssue18a(charity);
  const [donatable, { photos, updates }, campaigns] = await Promise.all([loadDonatableCharity(charity.slug), loadStories(charity.id, 5), loadOpenCampaigns(charity.id)]);
  const accepting = donatable?.acceptingPayments ?? false;
  const categories = charity.charity_categories
    .map((cc) => cc.categories as unknown as { name_en: string } | null)
    .filter((c): c is { name_en: string } => c !== null);

  const area = [charity.suburb, charity.city].filter(Boolean).join(", ");
  const monogram = initials(charity.name_en);

  return (
    <article className="space-y-4">
      <div className="overflow-hidden rounded-card border-[1.5px] border-border bg-surface">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <div aria-hidden className="relative aspect-[3/1] w-full overflow-hidden bg-brand">
            <span className="blob absolute -right-10 -top-12 h-32 w-32 bg-coral sm:h-48 sm:w-48" />
            <span className="blob absolute -bottom-12 left-1/3 h-24 w-32 rotate-12 bg-honey" />
          </div>
        )}
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-end gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="-mt-14 h-20 w-20 shrink-0 rounded-card border-4 border-surface bg-surface object-cover" />
            ) : (
              <div aria-hidden className="-mt-14 flex h-20 w-20 shrink-0 items-center justify-center rounded-card border-4 border-surface bg-brand font-display text-2xl text-white">
                {monogram}
              </div>
            )}
            <div className="min-w-0 pb-1">
              <h1 className="text-3xl leading-tight">{charity.name_en}</h1>
              {area ? <p className="text-sm text-muted">{area}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <CharityBadges charity={charity} />
            {categories.map((c) => <Badge key={c.name_en}>{c.name_en}</Badge>)}
          </div>
          {charity.impact_en ? (
            <div className="rounded-card bg-honey-soft p-4">
              <p className="text-sm font-semibold text-brand">Your rand at work</p>
              <p className="mt-1 font-display text-xl leading-snug text-navy">{charity.impact_en}</p>
            </div>
          ) : null}
          {accepting ? (
            <Link
              href={withSource(`/c/${charity.slug}/donate`, src)}
              className="pressable block w-full rounded-control bg-coral px-4 py-3.5 text-center text-lg font-bold text-navy"
            >
              Give to {charity.name_en}
            </Link>
          ) : (
            <p className="rounded-control bg-honey-soft p-3 text-center text-sm text-muted">Online giving opens soon.</p>
          )}
          <p className="text-xs text-muted">
            {receipts
              ? "Donations qualify for one s18A receipt a year, issued on this organisation's behalf."
              : "This organisation is not s18A-approved, so donations do not get a tax receipt."}{" "}
            Givezy charges no fee on donations.
          </p>
          <Info terms={["s18a"]} label="an s18A receipt" />
        </div>
      </div>

      {/* What they're raising for right now comes before the story. */}
      {campaigns.map((c) => (
        <CampaignProgress key={c.id} campaign={c} giveHref={accepting ? withSource(`/c/${charity.slug}/donate?campaign=${c.id}`, src) : undefined} />
      ))}

      {charity.description_en ? (
        <Card title="What they do">
          <p className="whitespace-pre-line text-[0.95rem] leading-relaxed">{charity.description_en}</p>
        </Card>
      ) : null}

      {charity.funds_use_en ? (
        <Card title="How your donation is used">
          <p className="whitespace-pre-line text-[0.95rem] leading-relaxed">{charity.funds_use_en}</p>
        </Card>
      ) : null}

      {updates.length ? (
        <Card title="Latest from them">
          <ul className="space-y-4">
            {updates.map((u) => {
              const photo = publicImageUrl(u.photo_path);
              return (
                <li key={u.id} className="space-y-2">
                  <p className="text-xs text-muted">{formatDate(u.created_at)}</p>
                  <p className="whitespace-pre-line text-[0.95rem] leading-relaxed">{u.body_en}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-card border border-border object-cover" /> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {photos.length ? (
        <Card title="Photos">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id}>
                <figure className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={publicImageUrl(p.storage_path)!} alt={p.caption_en ?? ""} loading="lazy" className="aspect-square w-full rounded-card border border-border object-cover" />
                  {p.caption_en ? <figcaption className="text-xs text-muted">{p.caption_en}</figcaption> : null}
                </figure>
              </li>
            ))}
          </ul>
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
