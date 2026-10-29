import Link from "next/link";
import { Info } from "@/components/info";
import { platformConfig } from "@/config/platform";
import { initials } from "@/lib/charity/initials";
import { loadCategories, publicImageUrl } from "@/lib/charity/queries";
import { weekStart } from "@/lib/charity/thank-you";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { Chevron } from "@/components/chevron";
import { AppWindow, BlueCards, Confetti, FeatureCard, Floating, Icon, Key, MiniPoint, PastelCard, Ready, SampleNote, Screen, SectionHead, Steps, h2Class } from "@/components/marketing";

// Home page, direction B (preview, 29/10/2026), laid out after the Deupload landing page Yehuda liked: see
// components/marketing.tsx. Every figure in a picture is a labelled sample; every claim is one we can back today.

const min = formatRand(platformConfig.minDonationCents);
const minContribution = formatRand(platformConfig.minContributionCents);

function Tick({ className = "stroke-sage" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`mt-0.5 shrink-0 ${className}`}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

const gifts = [
  { date: "02/10/2026", name: "A food parcel charity", tag: "s18A receipt", amount: "R500", tone: "bg-peach" },
  { date: "28/09/2026", name: "A school charity", tag: "Once-off", amount: "R250", tone: "bg-brand-soft" },
  { date: "19/09/2026", name: "An old-age home", tag: "Monthly", amount: "R180", tone: "bg-honey-soft" },
  { date: "05/09/2026", name: "A medical support charity", tag: "s18A receipt", amount: "R360", tone: "bg-peach" },
  { date: "19/08/2026", name: "An old-age home", tag: "Monthly", amount: "R180", tone: "bg-honey-soft" },
];

/** The hero picture: the donor's giving history, as a sample. */
function HeroScreen() {
  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-[1.25rem] font-bold">Giving history</p>
      </div>
      <ul className="flex flex-col">
        {gifts.map((g, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
            <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-[13px] font-bold text-brand ${g.tone}`}>{initials(g.name.replace(/^An? /, ""))}</span>
            <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[14px] font-semibold">{g.name}</span><span className="text-[12px] text-muted">{g.date} · {g.tag}</span></span>
            <span className="shrink-0 text-[14px] font-bold">{g.amount}</span>
          </li>
        ))}
      </ul>
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
      {/* Hero: centred words, then the product window with floating cards */}
      <section className="mx-auto flex max-w-[75rem] flex-col items-center gap-5 px-4 pb-24 pt-14 text-center sm:px-6 sm:pt-20">
        <h1 className="max-w-[46rem] text-[clamp(2.375rem,4.6vw,3.5rem)] font-bold! leading-[1.12] text-balance">
          Give in a minute. We keep the <Key>paperwork</Key>.
        </h1>
        <p className="max-w-[36rem] text-[17px] leading-relaxed text-muted">
          Find a charity, give from {min} once or every month, and see every gift in one place. We check every charity before it can take a gift.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href="/charities" className="pressable rounded-control bg-coral px-6 py-3.5 font-bold text-navy">Find a charity</Link>
          <Link href="#how" className="rounded-control border-2 border-navy/15 bg-white px-6 py-3 font-bold text-navy hover:border-brand">How it works</Link>
        </div>

        <div className="relative mt-14 w-full max-w-[60rem]">
          <Confetti />
          <div className="relative mx-auto max-w-[48rem]">
            <AppWindow nav={["Home", "Giving", "Receipts", "Charities", "Account"]} active={1}><HeroScreen /></AppWindow>
            {/* Left: the goal ring */}
            <Floating className="-left-24 bottom-6 w-60">
              <p className="text-[12px] font-semibold text-muted">Your goal this tax year</p>
              <div className="mt-2 flex items-center gap-3">
                <svg width="64" height="64" viewBox="0 0 124 124" aria-hidden className="shrink-0">
                  <circle cx="62" cy="62" r="50" fill="none" stroke="var(--border)" strokeWidth="16" />
                  <circle cx="62" cy="62" r="50" fill="none" stroke="var(--coral)" strokeWidth="16" strokeLinecap="round" strokeDasharray="223 314" transform="rotate(-90 62 62)" />
                </svg>
                <div><p className="font-display text-[1.5rem] font-bold leading-none">R4 250</p><p className="mt-1 text-[12px] text-muted">71% of R6 000</p></div>
              </div>
            </Floating>
            {/* Right: a gift just made */}
            <Floating className="-right-24 -top-10 w-64">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft"><Icon name="check" className="stroke-success" size={16} /></span>
                <p className="text-[14px] font-bold">Thank you, Sarah</p>
              </div>
              <p className="mt-2 text-[13px] text-muted">R500 to a food parcel charity</p>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-honey-soft px-3 py-2 text-[12px]"><span className="text-muted">s18A receipt</span><span className="font-bold text-brand">Requested</span></div>
            </Floating>
            <p className="mt-3 text-right text-xs text-muted">Sample screens</p>
          </div>
        </div>
      </section>

      {/* Three blue cards */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-12 px-4 pb-24 sm:px-6">
        <SectionHead title={<>Quick. Checked. <Key>Free.</Key></>}>
          Everything you need to give with confidence, and nothing taken off your gift by us.
        </SectionHead>
        <BlueCards
          items={[
            { icon: "bolt", title: "Give in a minute", body: `Choose an amount from ${min}, once or every month, and pay on the payment provider's secure page.`, href: "/charities", link: "Find a charity" },
            { icon: "shield", title: "Every charity checked", body: "A person looks at each charity's registration documents and bank details before it can take a gift.", href: "/for-charities", link: "How charities join" },
            { icon: "heart", title: "No Givezy fee", body: "We don't take a cut. The card provider's fee comes off before the gift reaches the charity.", href: "#pricing", link: "What it costs" },
          ]}
        />
      </section>

      {/* Two pastel cards and a wide lilac card */}
      <section className="mx-auto flex max-w-[75rem] flex-col gap-10 px-4 pb-24 sm:px-6">
        <h2 className={`max-w-[34rem] ${h2Class}`}>One account for all your giving, ready at <Key>tax time</Key>.</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <PastelCard tone="peach" title="Once or monthly" body="Give once, or set up a monthly donation and pause or stop it yourself whenever you like.">
            <Screen>
              <p className="text-[13px] font-semibold text-muted">Choose an amount</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[15px] font-bold">
                <span className="rounded-lg border-[1.5px] border-border py-2">R180</span>
                <span className="rounded-lg border-2 border-brand bg-brand-soft py-2 text-brand">R360</span>
                <span className="rounded-lg border-[1.5px] border-border py-2">R500</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-[14px]"><span className="font-semibold">Give every month</span><span aria-hidden className="flex h-6 w-11 items-center rounded-full bg-brand p-0.5"><span className="ml-auto h-5 w-5 rounded-full bg-white" /></span></div>
            </Screen>
          </PastelCard>
          <PastelCard tone="sky" title="s18A receipts, done" body="If the charity issues them, you get one receipt per charity for the whole tax year, all in your account.">
            <Screen>
              <p className="text-[13px] font-semibold text-muted">Your s18A receipts</p>
              <ul className="mt-2 flex flex-col gap-2 text-[14px]">
                <li className="flex items-center justify-between rounded-lg bg-honey-soft px-3 py-2"><span>Food parcel charity</span><span className="font-bold">R2 160</span></li>
                <li className="flex items-center justify-between rounded-lg bg-honey-soft px-3 py-2"><span>Medical support</span><span className="font-bold">R1 590</span></li>
              </ul>
              <p className="mt-3 text-[13px] font-bold text-brand">Download tax pack</p>
            </Screen>
          </PastelCard>
        </div>
        <div id="discover" className="grid items-center gap-8 rounded-[1.25rem] bg-honey-soft p-7 sm:p-10 md:grid-cols-2">
          <div className="flex flex-col items-start gap-4">
            <h3 className="font-display text-[clamp(1.625rem,2.6vw,2.125rem)] font-bold leading-tight"><Key>Find a cause</Key> that feels close to home.</h3>
            <p className="text-[16px] leading-relaxed text-muted">Food parcels, schools, shuls, medical help and more. Every charity on {platformConfig.appName} is registered and checked.</p>
            {categories.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label="Causes">
                {categories.map((c) => (
                  <li key={c.id}><Link href={`/charities?category=${c.slug}`} className="inline-block rounded-full border-[1.5px] border-honey bg-white px-3.5 py-1.5 text-[14px] font-semibold text-navy hover:border-brand">{c.name_en}</Link></li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-3">
              <Link href="/charities" className="pressable rounded-control bg-brand px-5 py-3 font-bold text-white">See all charities</Link>
            </div>
          </div>
          {featured || others.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {featured ? (
                <li>
                  <Link href={`/c/${featured.slug}`} className="relative flex min-h-[9rem] flex-col justify-end gap-1 overflow-hidden rounded-[1.125rem] bg-brand p-5 text-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                    {cover ? <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy/90 to-navy/10" /> : null}
                    <span className="relative text-[13px] font-bold text-honey">Cause of the week</span>
                    <span className="relative font-display text-[1.375rem] font-bold">{featured.name_en}</span>
                  </Link>
                </li>
              ) : null}
              {others.map((c, i) => {
                const logo = publicImageUrl(c.logo_path);
                const place = [c.suburb, c.city].filter(Boolean).join(", ");
                return (
                  <li key={c.id}>
                    <Link href={`/c/${c.slug}`} className="flex items-center gap-4 rounded-[1.125rem] bg-white p-4 shadow-[0_12px_30px_rgba(14,27,61,0.06)] hover:ring-2 hover:ring-brand">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span aria-hidden className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display font-bold text-brand ${i % 2 ? "bg-brand-soft" : "bg-peach"}`}>{initials(c.name_en)}</span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold text-navy">{c.name_en}</span>{place ? <span className="text-sm text-muted">{place}</span> : null}</span>
                      <Chevron />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-[1.125rem] bg-white p-6">
              <p className="font-display text-xl font-bold text-brand">The first charities are joining now</p>
              <p className="text-muted">Check back soon, or tell a charity you love about {platformConfig.appName}.</p>
            </div>
          )}
        </div>
      </section>

      {/* Soft section: words on the left, stacked white cards on the right */}
      <section className="bg-honey-soft">
        <div className="mx-auto grid max-w-[75rem] items-center gap-12 px-4 py-24 sm:px-6 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 className={h2Class}>Your details, kept <Key>private</Key>.</h2>
            <p className="text-[17px] leading-relaxed text-muted">The charity sees what it needs to thank you and record your gift. The rest stays between you and {platformConfig.appName}.</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <MiniPoint icon="eye" tone="sage" title="Anonymous in public" body="Tick a box and your name stays off the charity's public page." />
              <MiniPoint icon="download" tone="peach" title="Your information, your call" body="Download everything we hold about you, or ask us to erase it." />
            </div>
          </div>
          <ul className="flex flex-col gap-4">
            <FeatureCard icon="lock" title="Your card stays with the bank" body={`You pay on the payment provider's page. ${platformConfig.appName} never sees or stores card details.`} />
            <FeatureCard icon="user" title="No ID numbers for charities" body="Charities never see any part of your ID or tax number. It goes only on your s18A receipt." />
            <FeatureCard icon="heart" title="Your maaser stays yours" body="Whether a gift is maaser, chomesh or general tzedaka is private to you. Charities don't see it." />
          </ul>
        </div>
      </section>

      {/* Coloured band with cards hanging over its edge */}
      <section id="pricing" className="pb-24">
        <div className="bg-honey pb-48 pt-20">
          <div className="mx-auto max-w-[75rem] px-4 sm:px-6">
            <SectionHead title={<>Simple. <Key>Fair</Key> to every charity.</>}>
              <span className="text-navy">{platformConfig.appName} costs donors and charities nothing to use.</span>
            </SectionHead>
          </div>
        </div>
        <div className="mx-auto -mt-36 grid max-w-[56rem] gap-0 px-4 sm:px-6 md:grid-cols-2">
          <div className="flex flex-col items-center gap-3 rounded-[1.25rem] bg-white p-8 text-center shadow-[0_30px_60px_rgba(14,27,61,0.12)] md:rounded-r-none">
            <p className="text-[18px] font-bold">For donors</p>
            <p className="text-[14px] text-muted">Give to any listed charity</p>
            <p className="mt-2 font-display text-[3rem] font-bold leading-none">R0</p>
            <p className="text-[13px] text-muted">{platformConfig.appName} fee on your gift</p>
            <Link href="/charities" className="pressable mt-3 w-full rounded-control bg-brand px-5 py-3 font-bold text-white">Find a charity</Link>
            <ul className="mt-3 flex flex-col gap-2 self-stretch text-left text-[14px]">
              <li className="flex gap-2"><Tick />Give from {min}, once or monthly</li>
              <li className="flex gap-2"><Tick />Every gift and receipt in one account</li>
              <li className="flex gap-2"><Tick />Add a contribution to {platformConfig.appName} only if you choose, from {minContribution}</li>
            </ul>
          </div>
          <div className="flex flex-col gap-5 rounded-[1.25rem] bg-brand p-8 text-white md:mt-8 md:rounded-l-none">
            <p className="text-[18px] font-bold">For charities</p>
            <p className="text-[14px] text-honey-soft">Everything you need to receive gifts online</p>
            <div className="border-t border-white/20 pt-4">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold text-honey">Listing</span>
              <p className="mt-2 font-display text-[2.25rem] font-bold leading-none">R0 <span className="text-[14px] font-normal text-honey-soft">sign-up and monthly</span></p>
            </div>
            <div className="border-t border-white/20 pt-4">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-bold text-honey">Card fee</span>
              <p className="mt-2 text-[15px] leading-relaxed text-honey-soft">The card provider&apos;s fee comes off each donation. The rest goes straight to your bank account.</p>
            </div>
            <Link href="/for-charities" className="mt-auto inline-flex items-center gap-1 font-bold text-white hover:underline">How it works for charities</Link>
          </div>
        </div>
        <div className="mx-auto mt-10 flex max-w-[40rem] flex-col items-center gap-4 px-4 text-center">
          <p className="text-[16px] leading-relaxed text-muted">No hidden fees and no subscriptions. You only ever pay what you choose to give.</p>
          <Info terms={["s18a"]} label="an s18A receipt" />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto flex max-w-[75rem] flex-col gap-14 px-4 pb-24 sm:px-6">
        <SectionHead title="How it works">Three steps, then it&apos;s done. You can come back to your account any time.</SectionHead>
        <Steps
          steps={[
            { icon: "search", title: "Pick a charity", body: "Search by name, cause or area. Every charity is checked before it can take a gift." },
            { icon: "heart", title: `Give from ${min}`, body: "Once, or every month. You pay on the payment provider's secure page." },
            { icon: "receipt", title: "Keep track", body: "Every gift sits in your account, with your s18A receipts when the tax year ends." },
          ]}
        />
      </section>

      {/* Ready to get started? */}
      <section className="mx-auto max-w-[75rem] px-4 pb-24 sm:px-6">
        <Ready
          button={{ href: "/charities", label: "Find a charity" }}
          small={{ icon: "user", title: "Giving as a person?", body: "Find a registered charity and give once or every month. Every gift lands in one list.", href: "/charities", link: "Start giving" }}
          wide={{
            icon: "building",
            title: "Run a charity?",
            body: "Listing is free. Donations go straight to your own bank account, and your donors' s18A receipts are made for you.",
            href: "/for-charities",
            link: "How it works for charities",
            picture: (
              <div className="rounded-[1.125rem] bg-white p-4 shadow-[0_12px_30px_rgba(14,27,61,0.08)]">
                <p className="text-[12px] text-muted">This month</p>
                <p className="font-display text-[1.5rem] font-bold">R4 920</p>
                <div className="mt-3 flex h-16 items-end gap-1.5" aria-hidden>
                  {[30, 55, 40, 70, 50, 85, 100].map((h, i) => <span key={i} className={`flex-1 rounded-t ${i === 6 ? "bg-brand" : "bg-honey"}`} style={{ height: `${h}%` }} />)}
                </div>
                <SampleNote />
              </div>
            ),
          }}
        />
      </section>
    </div>
  );
}
