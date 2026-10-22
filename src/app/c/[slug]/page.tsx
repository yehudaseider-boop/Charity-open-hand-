import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge } from "@/components/badge";
import { CampaignProgress } from "@/components/campaign-progress";
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
import { Drop } from "@/components/drop";

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

  const give = accepting ? withSource(`/c/${charity.slug}/donate`, src) : null;

  return (
    // full-bleed: this page runs edge to edge, with its own 1 200 px column (see globals.css).
    <article className="full-bleed overflow-x-clip">
      <div className="mx-auto max-w-[75rem] px-4 pt-4 sm:px-6 sm:pt-6">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="aspect-[16/9] w-full rounded-[2rem] object-cover sm:aspect-[3/1]" />
        ) : (
          <div aria-hidden className="relative aspect-[5/2] w-full overflow-hidden rounded-[2rem] bg-brand sm:aspect-[4/1]">
            <Drop colour="lilac" className="-top-10 right-28 h-32 w-auto -rotate-12 sm:right-48 sm:h-44" />
            <Drop colour="orange" className="-top-6 right-6 h-28 w-auto rotate-12 sm:right-16 sm:h-40" />
          </div>
        )}
        <header className="flex flex-wrap items-end gap-x-5 gap-y-3 px-1 sm:px-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="relative z-10 -mt-12 h-24 w-24 shrink-0 rounded-card border-4 border-surface bg-surface object-cover sm:-mt-16 sm:h-32 sm:w-32" />
          ) : (
            <div aria-hidden className="relative z-10 -mt-12 flex h-24 w-24 shrink-0 items-center justify-center rounded-card border-4 border-surface bg-peach font-display text-3xl font-semibold text-brand sm:-mt-16 sm:h-32 sm:w-32 sm:text-4xl">
              {monogram}
            </div>
          )}
          <div className="min-w-0 flex-[1_1_16rem] pt-2">
            <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] text-balance">{charity.name_en}</h1>
            {area ? <p className="mt-1 text-muted">{area}</p> : null}
          </div>
        </header>
        <div className="mt-4 flex flex-wrap gap-2 px-1 sm:px-4">
          <CharityBadges charity={charity} />
          {categories.map((c) => <Badge key={c.name_en}>{c.name_en}</Badge>)}
        </div>
      </div>

      <div className="mx-auto grid max-w-[75rem] gap-8 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
        {/* Giving comes first on a phone, and stays beside the story on a laptop. */}
        <aside className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start">
          <div className="space-y-4 rounded-[1.75rem] border-2 border-border bg-surface p-5 sm:p-6">
            {charity.impact_en ? (
              <div className="rounded-control bg-honey-soft p-4">
                <p className="text-sm font-bold text-brand">Your rand at work</p>
                <p className="mt-1 font-display text-xl font-semibold leading-snug text-navy">{charity.impact_en}</p>
              </div>
            ) : null}
            {give ? (
              <Link href={give} className="pressable block w-full rounded-control bg-coral px-4 py-4 text-center text-lg font-bold text-navy">
                Give to {charity.name_en}
              </Link>
            ) : (
              <p className="rounded-control bg-honey-soft p-4 text-center text-muted">
                Online giving to {charity.name_en} opens soon.
              </p>
            )}
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <Tick yes={receipts} />
                <span>
                  {receipts
                    ? "One s18A receipt a year for your gifts, if you ask for it, issued on this organisation's behalf."
                    : "This organisation is not s18A-approved, so gifts don't get a tax receipt."}
                </span>
              </li>
              <li className="flex gap-2"><Tick yes />No Givezy fee on your gift.</li>
              <li className="flex gap-2"><Tick yes />You pay on the payment provider&apos;s page. We never see your card.</li>
            </ul>
            <Info terms={["s18a"]} label="an s18A receipt" />
          </div>
        </aside>

        <div className="min-w-0 space-y-10 lg:col-start-1 lg:row-start-1">
          {/* What they're raising for right now comes before the story. */}
          {campaigns.length ? (
            <div className="space-y-4">
              {campaigns.map((c) => (
                <CampaignProgress key={c.id} campaign={c} giveHref={accepting ? withSource(`/c/${charity.slug}/donate?campaign=${c.id}`, src) : undefined} />
              ))}
            </div>
          ) : null}

          {charity.description_en ? (
            <Section title="What they do">
              <p className="whitespace-pre-line text-[17px] leading-relaxed">{charity.description_en}</p>
            </Section>
          ) : null}

          {charity.funds_use_en ? (
            <Section title="How your gift is used">
              <p className="whitespace-pre-line text-[17px] leading-relaxed">{charity.funds_use_en}</p>
            </Section>
          ) : null}

          {updates.length ? (
            <Section title="Latest from them">
              <ul className="space-y-4">
                {updates.map((u) => {
                  const photo = publicImageUrl(u.photo_path);
                  return (
                    <li key={u.id} className="space-y-3 rounded-card bg-honey-soft p-5">
                      <p className="text-sm font-semibold text-muted">{formatDate(u.created_at)}</p>
                      <p className="whitespace-pre-line leading-relaxed">{u.body_en}</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {photo ? <img src={photo} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-control object-cover" /> : null}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {photos.length ? (
            <Section title="Photos">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id}>
                    <figure className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicImageUrl(p.storage_path)!} alt={p.caption_en ?? ""} loading="lazy" className="aspect-square w-full rounded-control object-cover" />
                      {p.caption_en ? <figcaption className="text-sm text-muted">{p.caption_en}</figcaption> : null}
                    </figure>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Registration">
            <dl className="divide-y divide-border rounded-card border-2 border-border px-5 text-[15px]">
              <Row label="Registered name" value={charity.legal_name_en} />
              {charity.npo_number ? <Row label="NPO number" value={charity.npo_number} /> : null}
              {charity.pbo_number ? <Row label="PBO number" value={charity.pbo_number} /> : null}
              {charity.website ? (
                <Row
                  label="Website"
                  value={<a href={charity.website} rel="noopener noreferrer nofollow" target="_blank" className="break-all font-semibold text-brand underline">{charity.website.replace(/^https?:\/\//, "")}</a>}
                />
              ) : null}
            </dl>
            {charity.is_verified ? (
              <p className="mt-3 text-sm text-muted">Verified: we have checked this organisation&apos;s registration and bank details.</p>
            ) : null}
          </Section>
        </div>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-[1.75rem] font-semibold leading-tight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 font-semibold">{value}</dd>
    </div>
  );
}

/** A sage tick for yes, a slate dash for no (the same pair as the s18A badge). */
function Tick({ yes }: { yes: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${yes ? "stroke-sage" : "stroke-muted"}`}>
      {yes ? <path d="M5 12.5l4.2 4.2L19 7" /> : <path d="M6 12h12" />}
    </svg>
  );
}
