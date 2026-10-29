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
import { Splash } from "@/components/splash";
import { Bubbles } from "@/components/marketing";
import { StickyGive } from "@/components/sticky-give";
import { impactUnitFrom } from "@/lib/charity/impact";
import { formatRand } from "@/lib/money";

const loadCharity = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charities")
    .select(
      "id, slug, name_en, legal_name_en, description_en, funds_use_en, impact_en, impact_unit_cents, impact_unit_one, impact_unit_many, website, logo_path, cover_path, npo_number, pbo_number, s18a_reference, suburb, city, is_verified, is_s18a, mandate_signed_at, charity_categories(categories(name_en))",
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
  const unit = impactUnitFrom(charity);
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
          // No cover photo yet: a blue colour block with bubbles and the logo's splash, whole, on the right.
          <div aria-hidden className="relative flex h-36 w-full items-center justify-end overflow-hidden rounded-[2rem] bg-brand pr-6 sm:h-52 sm:pr-14">
            <Bubbles
              items={[
                { c: "-left-12 -top-16 h-32 w-32 bg-coral sm:-left-16 sm:-top-20 sm:h-56 sm:w-56", anim: "bob-slow" },
                { c: "left-[30%] -bottom-24 h-48 w-48 border-[18px] border-white/10" },
                { c: "left-[22%] top-8 h-4 w-4 bg-honey", anim: "bob" },
                { c: "right-[34%] top-10 h-8 w-8 border-[4px] border-honey", anim: "bob-slow" },
                { c: "right-[40%] bottom-8 h-3 w-3 bg-white/70" },
              ]}
            />
            <span className="relative rounded-[1.75rem] bg-white/95 px-5 py-4 sm:px-7 sm:py-5"><Splash className="h-auto w-24 sm:w-36" /></span>
          </div>
        )}
        <header className="flex flex-wrap items-end gap-x-5 gap-y-3 px-4 sm:px-8">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="relative z-10 -mt-12 h-24 w-24 shrink-0 rounded-[1.75rem] bg-surface object-cover shadow-[0_0_0_5px_var(--surface),0_12px_28px_rgba(9,37,119,0.14)] sm:-mt-16 sm:h-32 sm:w-32" />
          ) : (
            <div aria-hidden className="relative z-10 -mt-12 flex h-24 w-24 shrink-0 items-center justify-center rounded-[1.75rem] bg-peach font-display text-3xl font-bold text-brand shadow-[0_0_0_5px_var(--surface),0_12px_28px_rgba(9,37,119,0.14)] sm:-mt-16 sm:h-32 sm:w-32 sm:text-4xl">
              {monogram}
            </div>
          )}
          <div className="min-w-0 flex-[1_1_16rem] pt-2">
            <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] text-balance">{charity.name_en}</h1>
            {area ? <p className="mt-1 text-muted">{area}</p> : null}
          </div>
        </header>
        <div className="mt-4 flex flex-wrap gap-2 px-4 sm:px-8">
          <CharityBadges charity={charity} />
          {categories.map((c) => <Badge key={c.name_en}>{c.name_en}</Badge>)}
        </div>
      </div>

      <div className={`mx-auto grid max-w-[75rem] grid-cols-1 gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12 pb-20`}>
        {/* Giving comes first on a phone, and stays beside the story on a laptop. */}
        <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
          <div className="relative isolate space-y-4 overflow-hidden rounded-[1.75rem] border-2 border-border bg-surface p-5 shadow-[0_24px_48px_rgba(23,73,181,0.08)] sm:p-6">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-28 w-28 rounded-full bg-honey-soft" />
            {charity.impact_en || unit ? (
              <div className="rounded-control bg-[#fff4ec] p-4">
                <p className="text-sm font-bold text-[#b4501a]">What your gift does</p>
                {charity.impact_en ? <p className="mt-1 font-display text-xl font-bold leading-snug text-navy">{charity.impact_en}</p> : null}
                {unit ? (
                  <p className={charity.impact_en ? "mt-2 text-sm text-muted" : "mt-1 font-display text-xl font-bold leading-snug text-navy"}>
                    {formatRand(unit.cents)} pays for one {unit.one}{charity.impact_en ? `, by ${charity.name_en}'s own figure` : ""}.
                  </p>
                ) : null}
              </div>
            ) : null}
            {give ? (
              <Link id="give-button" href={give} aria-label={`Give to ${charity.name_en}`} className="pressable flex w-full min-w-0 flex-col items-center rounded-control bg-coral px-4 py-3.5 text-center text-navy">
                {/* "Give" stays big; the name sits on one smaller line, so a long name never makes a giant button. */}
                <span className="text-lg font-bold leading-tight">Give</span>
                <span className="block w-full min-w-0 truncate text-sm font-semibold">to {charity.name_en}</span>
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
        </div>

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
              <ul className="relative space-y-4 pl-7 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-0.5 before:rounded-full before:bg-honey">
                {updates.map((u, i) => {
                  const photo = publicImageUrl(u.photo_path);
                  return (
                    <li key={u.id} className="relative space-y-3 rounded-card bg-honey-soft p-5">
                      <span aria-hidden className={`absolute -left-7 top-6 h-4 w-4 rounded-full border-[3px] border-white ${i === 0 ? "bg-coral" : "bg-brand"}`} />
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
      {/* Phones: Give stays in reach at the bottom once the card's own button has scrolled away. */}
      {give ? <StickyGive href={give} label={`Give to ${charity.name_en}`} watch="give-button" /> : null}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-[1.75rem] font-bold leading-tight">{title}</h2>
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
