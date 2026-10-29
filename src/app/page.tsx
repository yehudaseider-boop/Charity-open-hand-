import Link from "next/link";
import { Info } from "@/components/info";
import { platformConfig } from "@/config/platform";
import { initials } from "@/lib/charity/initials";
import { loadCategories, publicImageUrl } from "@/lib/charity/queries";
import { weekStart } from "@/lib/charity/thank-you";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { Chevron } from "@/components/chevron";
import { Splash } from "@/components/splash";
import { BlueCards, ClosingPair, Eyebrow, Key, Row, Steps, Window } from "@/components/marketing";

// Home page, direction B "Bands" (preview, 29/10/2026): a centred hero over a sample of the donor's page, a row of
// blue promise cards, alternating rows, a lavender band and a closing pair of cards. The logo's splash appears once, whole.

const min = formatRand(platformConfig.minDonationCents);
const minContribution = formatRand(platformConfig.minContributionCents);

const steps = [
  { title: "Pick a charity", body: "Search by name, cause or area. A person checks every charity's registration and bank details first." },
  { title: `Give from ${min}`, body: "Once, or every month. You pay on the payment provider's secure page, so we never see your card." },
  { title: "Keep track, without trying", body: "Every gift sits in your account. When the tax year ends, your s18A receipts are ready in one place." },
];

function Tick({ className = "stroke-sage" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** The donor's giving page, as a sample: the product is the picture. */
function GivingSample() {
  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="flex items-center gap-5 rounded-[1.5rem] bg-brand p-5 text-white">
        <svg width="104" height="104" viewBox="0 0 124 124" role="img" aria-label="Sample: 71 percent of a R6 000 goal" className="shrink-0">
          <circle cx="62" cy="62" r="52" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="14" />
          <circle cx="62" cy="62" r="52" fill="none" stroke="var(--coral)" strokeWidth="14" strokeLinecap="round" strokeDasharray="232 327" transform="rotate(-90 62 62)" />
          <text x="62" y="68" textAnchor="middle" fontFamily="var(--font-bricolage), sans-serif" fontWeight="700" fontSize="22" fill="#fff">71%</text>
        </svg>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold text-honey-soft/80">This tax year</span>
          <span className="font-display text-[2.25rem] font-extrabold leading-none tabular-nums">R4 250</span>
          <span className="text-sm text-honey-soft/90">of a R6 000 goal</span>
        </div>
      </div>
      <ul className="text-[15px]">
        <li className="flex justify-between gap-3 border-b border-border py-3"><span>02/10/2026 · A food parcel charity</span><span className="shrink-0 font-bold">R500</span></li>
        <li className="flex justify-between gap-3 border-b border-border py-3"><span>15/09/2026 · A school charity</span><span className="shrink-0 font-bold">R250</span></li>
        <li className="flex justify-between gap-3 py-3"><span>01/09/2026 · An old-age home (monthly)</span><span className="shrink-0 font-bold">R180</span></li>
      </ul>
    </div>
  );
}

/** The year's summary and tax pack, as a sample. */
function YearSample() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-control bg-honey-soft p-3.5"><p className="text-[13px] text-muted">Given</p><p className="mt-1 whitespace-nowrap font-display text-[1.125rem] font-bold sm:text-[1.5rem]">R4 250</p></div>
        <div className="rounded-control bg-honey-soft p-3.5"><p className="text-[13px] text-muted">Charities</p><p className="mt-1 whitespace-nowrap font-display text-[1.125rem] font-bold sm:text-[1.5rem]">3</p></div>
        <div className="rounded-control bg-peach p-3.5"><p className="text-[13px] text-muted">s18A</p><p className="mt-1 whitespace-nowrap font-display text-[1.125rem] font-bold sm:text-[1.5rem]">R3 750</p></div>
      </div>
      <div className="flex items-center gap-3 rounded-control border-[1.5px] border-border p-4">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand font-display text-sm font-bold text-white">PDF</span>
        <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold">Tax pack 2026/27</span><span className="text-[13px] text-muted">Every gift and your s18A receipts</span></span>
        <span className="font-bold text-brand">Download</span>
      </div>
    </div>
  );
}

export default async function Home() {
  // A few approved charities to show (row-level security shows only approved ones).
  const supabase = await createClient();
  const { data: charities } = await supabase
    .from("charities")
    .select("id, slug, name_en, description_en, logo_path, suburb, city")
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(4);
  // Cause of the week, chosen by Givezy (Admin, Cause of the week). None chosen, or it can't load: no big card.
  const { data: pick } = await supabase
    .from("featured_charities")
    .select("charities(slug, name_en, description_en, cover_path)")
    .eq("week_start", weekStart(new Date()))
    .maybeSingle();
  const featured = (pick?.charities ?? null) as unknown as { slug: string; name_en: string; description_en: string | null; cover_path: string | null } | null;
  const cover = featured ? publicImageUrl(featured.cover_path) : null;
  const others = (charities ?? []).filter((c) => c.slug !== featured?.slug).slice(0, 3);
  // Cause chips: the same categories as the Charities page. If they can't load, the page shows without them.
  const categories = await loadCategories().catch(() => []);

  return (
    // full-bleed: this page runs edge to edge, with its own 1 200 px column (see globals.css).
    <div className="full-bleed overflow-x-clip">
      {/* Hero: centred words, then the product */}
      <section className="relative bg-gradient-to-b from-honey-soft to-white">
        <div className="mx-auto flex max-w-[75rem] flex-col items-center gap-6 px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
          <h1 className="max-w-[52rem] text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] text-balance">
            Give in a minute. We keep the <Key>paperwork</Key>.
          </h1>
          <p className="max-w-[38rem] text-lg leading-normal text-muted sm:text-xl">
            Find a registered South African charity, give from {min}, and see every gift in one place. If the charity issues s18A
            receipts, you get one a year for everything you gave it.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-4">
            <Link href="/charities" className="pressable rounded-control bg-coral px-7 py-4 text-lg font-bold text-navy">Find a charity</Link>
            <Link href="#how" className="rounded-control border-2 border-brand bg-white px-7 py-[14px] text-lg font-bold text-brand hover:bg-honey-soft">How it works</Link>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2.5 text-[15px] font-semibold">
            <li className="flex items-center gap-2"><Tick />Every charity checked by a person</li>
            <li className="flex items-center gap-2"><Tick />No Givezy fee on your gift</li>
            <li className="flex items-center gap-2"><Tick />Your card stays with the bank</li>
          </ul>
          <div className="relative mt-24 w-full max-w-[56rem]">
            <Splash className="absolute -top-[5.5rem] right-8 hidden h-auto w-36 md:block" />
            <div className="relative text-left"><Window><GivingSample /></Window></div>
          </div>
        </div>
      </section>

      {/* Promises: three blue cards */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-10 px-4 py-20 sm:px-6">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <Eyebrow>Why Givezy</Eyebrow>
          <h2 className="font-display text-[clamp(2.125rem,4vw,3.25rem)] font-bold leading-[1.05] text-balance">Safe giving, <Key>without the admin</Key>.</h2>
        </div>
        <BlueCards
          items={[
            { icon: "shield", title: "Checked by a person", body: "We look at each charity's registration documents and bank details before it can take a gift." },
            { icon: "lock", title: "Your card stays with the bank", body: `You pay on the payment provider's page. ${platformConfig.appName} never sees or stores card details.` },
            { icon: "heart", title: "No Givezy fee on your gift", body: "We don't take a cut. The card provider's fee comes off before the gift reaches the charity." },
          ]}
        />
      </section>

      {/* Discover: real charities */}
      <section id="discover" className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6">
        <Row
          picture={
            featured || others.length > 0 ? (
              <div className="flex flex-col gap-4">
                {featured ? (
                  <Link href={`/c/${featured.slug}`} aria-label={`Cause of the week: ${featured.name_en}`} className="relative flex min-h-[16rem] flex-col justify-end gap-2 overflow-hidden rounded-[1.75rem] bg-brand p-7 text-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                    {cover ? <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/50 to-navy/10" /> : null}
                    <span className="relative text-sm font-bold text-honey">Cause of the week</span>
                    <span className="relative font-display text-[2rem] font-bold leading-[1.05]">{featured.name_en}</span>
                  </Link>
                ) : null}
                <ul className="flex flex-col gap-3">
                  {others.map((c, i) => {
                    const logo = publicImageUrl(c.logo_path);
                    const place = [c.suburb, c.city].filter(Boolean).join(", ");
                    return (
                      <li key={c.id}>
                        <Link href={`/c/${c.slug}`} className="flex items-center gap-4 rounded-card border-2 border-border bg-surface p-4 transition-colors hover:border-brand">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-control border border-border object-cover" />
                          ) : (
                            <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-control font-display text-lg font-bold text-brand ${i % 2 ? "bg-brand-soft" : "bg-peach"}`}>{initials(c.name_en)}</span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold text-navy">{c.name_en}</span>{place ? <span className="text-sm text-muted">{place}</span> : null}</span>
                          <Chevron />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-[1.75rem] border-2 border-border bg-surface p-7">
                <p className="font-display text-xl font-bold text-brand">The first charities are joining now</p>
                <p className="text-muted">Check back soon, or tell a charity you love about {platformConfig.appName}.</p>
                <Link href="/for-charities" className="font-bold text-brand underline underline-offset-4">How charities join</Link>
              </div>
            )
          }
        >
          <Eyebrow>Discover</Eyebrow>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.05] text-balance">Find a cause that feels <Key>close to home</Key>.</h2>
          <p className="text-lg leading-relaxed text-muted">Food parcels, schools, shuls, medical help and more. Every charity is registered and checked.</p>
          {categories.length > 0 ? (
            <ul className="flex flex-wrap gap-2.5" aria-label="Causes">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/charities?category=${c.slug}`} className="inline-block rounded-full border-2 border-border bg-surface px-4 py-2 font-semibold text-navy transition-colors hover:border-brand">{c.name_en}</Link>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/charities" className="inline-flex min-h-12 items-center text-[17px] font-bold text-brand underline underline-offset-4">See all charities</Link>
        </Row>
      </section>

      {/* Your year of giving */}
      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6">
        <Row flip picture={<Window><YearSample /></Window>}>
          <Eyebrow>Your account</Eyebrow>
          <h2 className="font-display text-[clamp(2rem,3.6vw,3rem)] font-bold leading-[1.05] text-balance">Your year of giving, <Key>on one page</Key>.</h2>
          <p className="text-lg leading-relaxed text-muted">See what you gave, to whom and when. Set a goal if you like. When the tax year ends, download your tax pack with your s18A receipts in it.</p>
          <ul className="flex flex-col gap-2.5 text-[17px]">
            <li className="flex items-center gap-2.5"><Tick />Every gift, every charity, one list</li>
            <li className="flex items-center gap-2.5"><Tick />Monthly donations you can pause or stop yourself</li>
            <li className="flex items-center gap-2.5"><Tick />A yearly tax pack, ready for your return</li>
          </ul>
        </Row>
      </section>

      {/* Lavender band: what it costs */}
      <section className="bg-honey">
        <div className="mx-auto flex max-w-[75rem] flex-col items-center gap-10 px-4 py-20 text-center sm:px-6">
          <div className="flex max-w-[40rem] flex-col gap-3">
            <h2 className="font-display text-[clamp(2.125rem,4vw,3.25rem)] font-bold leading-[1.05]">Simple. <Key>Free.</Key></h2>
            <p className="text-lg leading-relaxed text-navy">{platformConfig.appName} doesn&apos;t take anything from your gift.</p>
          </div>
          <div className="grid w-full max-w-[56rem] gap-5 text-left md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-[1.75rem] bg-white p-8">
              <p className="font-bold text-brand">For donors</p>
              <p className="font-display text-[3rem] font-extrabold leading-none">R0</p>
              <p className="text-muted">to use {platformConfig.appName}. Give from {min}. You can add a separate contribution to {platformConfig.appName} if you like, from {minContribution}. It&apos;s off unless you tick it.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-[1.75rem] bg-brand p-8 text-white">
              <p className="font-bold text-honey">For charities</p>
              <p className="font-display text-[3rem] font-extrabold leading-none">R0</p>
              <p className="text-honey-soft">to list. No sign-up or monthly fee. The card provider&apos;s fee comes off each donation, and the rest goes straight to the charity&apos;s bank account.</p>
            </div>
          </div>
          <Info terms={["s18a"]} label="an s18A receipt" />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto flex max-w-[75rem] flex-col items-center gap-12 px-4 py-20 text-center sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="font-display text-[clamp(2.125rem,4.4vw,3.25rem)] font-bold leading-none text-balance">Three steps, then it&apos;s <Key>done</Key>.</h2>
        </div>
        <div className="w-full text-left"><Steps steps={steps} /></div>
      </section>

      {/* Closing pair */}
      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6">
        <ClosingPair primary="donor" />
      </section>
    </div>
  );
}
