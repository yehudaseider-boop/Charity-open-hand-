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

// Home page, design direction A "Splash" (chosen 22/10/2026). The logo's splash (all three drops together, cut from
// the logo and never redrawn) appears once, whole, behind the hero picture; the rest of the page stays quiet.

const min = formatRand(platformConfig.minDonationCents);

const steps = [
  { title: "Pick a charity", body: "Search by name, cause or area. A person checks every charity's registration and bank details before it can take a gift.", rule: "border-brand", num: "text-brand" },
  { title: `Give from ${min}`, body: "Once, or every month. You pay on the payment provider's secure page, so we never see your card.", rule: "border-coral", num: "text-[#b4501a]" },
  { title: "Keep track, without trying", body: `Every gift sits in your ${platformConfig.appName} account. When the tax year ends, your s18A receipts are ready in one place.`, rule: "border-honey", num: "text-[#5b3fb0]" },
];

const promises = [
  { title: "Checked by a person", body: "We look at each charity's registration documents and bank details before it can take a gift." },
  { title: "Your card stays with the bank", body: `You pay on the payment provider's page. ${platformConfig.appName} never sees or stores card details.` },
  { title: `No ${platformConfig.appName} fee on your gift`, body: "We don't take a cut. The card provider's fee comes off before the gift reaches the charity." },
  { title: "s18A receipts, once a year", body: "If you ask for one, and the charity is approved to issue them: one receipt per charity for the whole tax year." },
];

function Tick({ className = "stroke-sage" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d="M5 12l5 5L20 7" />
    </svg>
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
      {/* Hero */}
      <section className="mx-auto flex max-w-[75rem] flex-wrap items-center gap-12 px-4 pb-20 pt-8 sm:px-6 sm:pb-24 sm:pt-12">
        <div className="relative z-10 flex min-w-0 flex-[1_1_34rem] flex-col items-start gap-6">
          <h1 className="text-[clamp(3rem,6.2vw,5.25rem)] leading-[0.96] text-balance">Give in a minute. We keep the paperwork.</h1>
          <p className="max-w-[33rem] text-lg leading-normal text-muted sm:text-xl">
            Find a registered South African charity, give from {min}, and see every gift in one place. If the charity issues s18A
            receipts, you can get one a year for everything you gave it.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-5">
            <Link href="/charities" className="pressable rounded-control bg-coral px-7 py-4 text-lg font-bold text-navy">
              Find a charity
            </Link>
            <Link href="#how" className="inline-flex min-h-12 items-center text-[17px] font-bold text-brand underline underline-offset-[5px]">How it works</Link>
          </div>
          <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-2.5 text-[15px] font-semibold">
            <li className="flex items-center gap-2"><Tick />Every charity checked by a person</li>
            <li className="flex items-center gap-2"><Tick />No Givezy fee on your gift</li>
            <li className="flex items-center gap-2"><Tick />Your card stays with the bank</li>
          </ul>
        </div>

        {/* The donor's giving page as the hero picture: the product, not stock photos. */}
        <div className="relative flex min-w-0 flex-[1_1_22rem] justify-center pb-5 pt-36 sm:pt-40">
          {/* The splash sits whole above the card's top corner, inside the page. */}
          <Splash className="absolute right-[max(0px,calc(50%-12.5rem))] top-0 h-auto w-44 sm:w-52" />
          <div className="relative z-10 flex w-full max-w-[25rem] flex-col gap-3.5">
            <div className="flex items-center gap-5 rounded-[1.875rem] bg-brand p-6 text-white shadow-[0_30px_60px_rgba(23,73,181,0.25)]">
              <svg width="128" height="128" viewBox="0 0 124 124" role="img" aria-label="Sample: 71 percent of a R6 000 goal" className="shrink-0">
                <circle cx="62" cy="62" r="52" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="14" />
                <circle cx="62" cy="62" r="52" fill="none" stroke="var(--coral)" strokeWidth="14" strokeLinecap="round" strokeDasharray="232 327" transform="rotate(-90 62 62)" />
                <text x="62" y="68" textAnchor="middle" fontFamily="var(--font-bricolage), sans-serif" fontWeight="700" fontSize="22" fill="#fff">71%</text>
              </svg>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-semibold text-honey-soft/80">Your giving this tax year</span>
                <span className="font-display text-[2.5rem] font-extrabold leading-none tabular-nums">R4 250</span>
                <span className="text-sm text-honey-soft/90">of a R6 000 goal</span>
              </div>
            </div>
            <div className="ml-8 flex items-center gap-3.5 rounded-3xl border-[1.5px] border-border bg-surface px-[18px] py-4 shadow-[0_20px_40px_rgba(14,27,61,0.08)]">
              <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.875rem] bg-peach font-display font-bold text-brand">NM</span>
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-bold">A food parcel charity</span><span className="text-[13px] text-muted">02/10/2026 · s18A receipt</span></span>
              <span className="font-display font-extrabold tabular-nums">R500</span>
            </div>
            <p className="self-center text-xs text-muted">Sample figures</p>
          </div>
        </div>
      </section>

      {/* Discover: one big story, then a short list. Real charities only. */}
      <section id="discover" className="bg-honey-soft py-16 sm:py-22">
        <div className="mx-auto flex max-w-[75rem] flex-col gap-9 px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[40rem] font-display text-[clamp(2.125rem,4vw,3.25rem)] font-bold leading-[1.05] text-balance">Find a cause that feels close to home.</h2>
            <Link href="/charities" className="inline-flex min-h-12 items-center text-[17px] font-bold text-brand underline underline-offset-4">See all charities</Link>
          </div>

          {categories.length > 0 ? (
            <ul className="flex flex-wrap gap-3" aria-label="Causes">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/charities?category=${c.slug}`}
                    className="inline-block rounded-full border-2 border-border bg-surface px-4.5 py-2.5 font-semibold text-navy transition-colors hover:border-brand"
                  >
                    {c.name_en}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {featured || others.length > 0 ? (
            <div className="flex flex-wrap gap-6">
              {featured ? (
                <Link
                  href={`/c/${featured.slug}`}
                  aria-label={`Cause of the week: ${featured.name_en}`}
                  className="relative flex min-h-[18rem] min-w-0 flex-[2_1_30rem] flex-col justify-end gap-2.5 overflow-hidden rounded-[2rem] bg-brand p-7 text-white sm:min-h-[21rem] sm:p-9"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  {cover ? <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/50 to-navy/10" /> : null}
                  <span className="relative text-sm font-bold text-honey">Cause of the week</span>
                  <span className="relative font-display text-[clamp(1.875rem,3.4vw,2.75rem)] font-bold leading-[1.05]">{featured.name_en}</span>
                  {featured.description_en ? <span className="relative line-clamp-3 max-w-[29rem] text-[17px] leading-normal text-honey-soft">{featured.description_en}</span> : null}
                  <span className="relative mt-2 inline-flex items-center gap-1 self-start font-bold text-white underline underline-offset-4">See their work</span>
                </Link>
              ) : null}
              {others.length > 0 ? (
                <ul className={`flex min-w-0 flex-col gap-4 ${featured ? "flex-[1_1_18rem]" : "flex-1 sm:grid sm:grid-cols-3"}`}>
                  {others.map((c, i) => {
                    const logo = publicImageUrl(c.logo_path);
                    const place = [c.suburb, c.city].filter(Boolean).join(", ");
                    return (
                      <li key={c.id}>
                        <Link href={`/c/${c.slug}`} className="group flex h-full items-center gap-4 rounded-card border-2 border-border bg-surface p-5 transition-colors hover:border-brand">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-control border border-border object-cover" />
                          ) : (
                            <span aria-hidden className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-control font-display text-xl font-bold text-brand ${i % 2 ? "bg-brand-soft" : "bg-peach"}`}>
                              {initials(c.name_en)}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-[17px] font-bold text-navy">{c.name_en}</span>
                            {place ? <span className="text-sm text-muted">{place}</span> : null}
                          </span>
                          <Chevron />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-card border-2 border-border bg-surface p-6">
              <p className="font-display text-xl font-bold text-brand">The first charities are joining now</p>
              <p className="text-muted">Check back soon, or tell a charity you love about {platformConfig.appName}.</p>
              <Link href="/for-charities" className="font-bold text-brand underline underline-offset-4">How charities join</Link>
            </div>
          )}
        </div>
      </section>

      {/* How it works: a path, not three identical boxes */}
      <section id="how" className="mx-auto flex max-w-[75rem] flex-col gap-12 px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="font-display text-[clamp(2.125rem,4.4vw,3.5rem)] font-extrabold leading-none text-balance">Three steps, then it&apos;s done</h2>
        <ol className="flex flex-wrap gap-8">
          {steps.map((st, i) => (
            <li key={st.title} className={`flex min-w-0 flex-[1_1_16rem] flex-col gap-3 border-t-[3px] pt-5 ${st.rule}`}>
              <span className={`font-display text-lg font-extrabold tabular-nums ${st.num}`}>{i + 1}</span>
              <h3 className="font-display text-[1.625rem] font-bold text-navy">{st.title}</h3>
              <p className="text-[17px] leading-relaxed text-muted">{st.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Your year of giving (a sample of the donor's account) */}
      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="relative flex flex-wrap items-center gap-12 overflow-hidden rounded-[2.5rem] bg-navy p-[clamp(1.75rem,5vw,4rem)]">
          <div className="relative flex min-w-0 flex-[1_1_22rem] flex-col gap-4.5">
            <h2 className="font-display text-[clamp(2rem,3.8vw,3rem)] font-bold leading-[1.05] text-white! text-balance">Your year of giving, on one page.</h2>
            <p className="text-lg leading-relaxed text-brand-soft">
              See what you gave, to whom and when. Set a goal if you like. When the tax year ends, download your tax pack with your
              s18A receipts in it.
            </p>
            <ul className="flex flex-col gap-2.5 text-[17px] text-white">
              <li className="flex items-center gap-2.5"><Tick className="stroke-coral" />Every gift, every charity, one list</li>
              <li className="flex items-center gap-2.5"><Tick className="stroke-coral" />Monthly donations you can pause or stop yourself</li>
              <li className="flex items-center gap-2.5"><Tick className="stroke-coral" />A yearly tax pack, ready for your return</li>
            </ul>
          </div>
          <div className="relative flex min-w-0 flex-[1_1_24rem] flex-col gap-3.5 rounded-[1.75rem] bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-[1.375rem] font-bold text-brand">Giving history</span>
              <span className="text-[13px] text-muted">Sample</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-control bg-honey-soft p-3.5"><p className="text-[13px] text-muted">Given this year</p><p className="mt-1 font-display text-[1.75rem] font-bold">R4 250</p></div>
              <div className="rounded-control bg-honey-soft p-3.5"><p className="text-[13px] text-muted">Charities</p><p className="mt-1 font-display text-[1.75rem] font-bold">3</p></div>
            </div>
            <ul className="text-[15px]">
              <li className="flex justify-between gap-3 border-b border-border py-3"><span>02/10/2026 · A food parcel charity</span><span className="shrink-0 whitespace-nowrap font-bold">R500</span></li>
              <li className="flex justify-between gap-3 border-b border-border py-3"><span>15/09/2026 · A school charity</span><span className="shrink-0 whitespace-nowrap font-bold">R250</span></li>
              <li className="flex justify-between gap-3 py-3"><span>01/09/2026 · An old-age home (monthly)</span><span className="shrink-0 whitespace-nowrap font-bold">R180</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* What we check and promise: plain facts, nothing we can't back */}
      <section className="mx-auto flex max-w-[75rem] flex-wrap gap-10 px-4 pb-20 sm:px-6 sm:pb-24">
        <h2 className="min-w-0 flex-[1_1_18rem] font-display text-[clamp(2rem,3.8vw,2.875rem)] font-bold leading-[1.05] text-balance">What we check, and what we promise.</h2>
        <div className="min-w-0 flex-[2_1_30rem] space-y-6">
          <dl className="grid gap-x-9 gap-y-7 sm:grid-cols-2">
            {promises.map((p) => (
              <div key={p.title} className="flex flex-col gap-1.5">
                <dt className="text-lg font-bold">{p.title}</dt>
                <dd className="leading-relaxed text-muted">{p.body}</dd>
              </div>
            ))}
          </dl>
          <Info terms={["s18a"]} label="an s18A receipt" />
        </div>
      </section>

      {/* For charities: the other half of the product, in one band */}
      <section className="mx-auto max-w-[75rem] px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="relative flex flex-wrap items-center justify-between gap-7 overflow-hidden rounded-[2.5rem] bg-brand px-[clamp(1.75rem,5vw,4rem)] py-[clamp(2.5rem,6vw,4.5rem)]">
          <div className="relative flex min-w-0 flex-[1_1_24rem] flex-col gap-3.5">
            <h2 className="font-display text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-none text-white! text-balance">Run a charity? Join for free.</h2>
            <p className="max-w-[34rem] text-lg leading-relaxed text-honey-soft">No sign-up fee and no monthly fee. Gifts go straight to your own bank account, and your donors&apos; s18A receipts are made for you once a year.</p>
          </div>
          <Link href="/for-charities" className="relative rounded-[1.125rem] bg-white px-7 py-4 text-lg font-bold text-navy transition-colors hover:bg-honey-soft">
            See how it works for charities
          </Link>
        </div>
      </section>
    </div>
  );
}
