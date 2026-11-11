import Link from "next/link";
import { BilingualName } from "@/components/bilingual-name";
import { CharityBadges } from "@/components/charity-badges";
import { CharitySearch } from "@/components/charity-search";
import { Illustration } from "@/components/illustration";
import { Bubbles, Key } from "@/components/marketing";
import { Splash } from "@/components/splash";
import { causeHref, coverTone, emptyState, resultsLine } from "@/lib/charity/browse";
import { initials } from "@/lib/charity/initials";
import { loadCategories, publicImageUrl } from "@/lib/charity/queries";
import { weekStart } from "@/lib/charity/thank-you";
import { createPublicClient } from "@/lib/supabase/public";

/** Keep only letters, digits, spaces and apostrophes. */
export function cleanQuery(q: unknown): string {
  return typeof q === "string" ? q.replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

type Row = {
  id: string;
  slug: string;
  name_en: string;
  description_en: string | null;
  logo_path: string | null;
  cover_path: string | null;
  suburb: string | null;
  city: string | null;
  is_verified: boolean;
  is_s18a: boolean;
  mandate_signed_at: string | null;
  charity_categories: { category_id: string }[];
};

/**
 * The charities list for a search and cause ("" and "" is the plain list). Public data only, read as an anonymous
 * visitor, so the plain list can be built ahead and served from cache (app/browse-charities) while a search is
 * built per visit (app/charities/page.tsx). The look follows the landing page (11/11/2026): a big headline over
 * soft lilac and peach splashes, the cause of the week as a blue colour block, and photo-led charity cards.
 */
export async function CharitiesView({ q, categorySlug }: { q: string; categorySlug: string }) {
  const supabase = createPublicClient();
  const categories = await loadCategories();
  const category = categories.find((c) => c.slug === categorySlug);

  // Row-level security only returns approved charities to the public.
  let query = supabase
    .from("charities")
    .select("id, slug, name_en, description_en, logo_path, cover_path, suburb, city, is_verified, is_s18a, mandate_signed_at, charity_categories(category_id)")
    .eq("status", "approved")
    .order("name_en");
  if (q) {
    // Quoted so spaces are safe; cleanQuery has already removed quotes and commas.
    const like = `"%${q}%"`;
    query = query.or(`name_en.ilike.${like},legal_name_en.ilike.${like},description_en.ilike.${like},suburb.ilike.${like},city.ilike.${like}`);
  }
  if (category) {
    const { data: links } = await supabase.from("charity_categories").select("charity_id").eq("category_id", category.id);
    query = query.in("id", (links ?? []).map((l) => l.charity_id));
  }
  const { data, error } = await query;
  if (error) throw error;
  const charities = data as Row[];

  // The cause of the week (picked in Admin, the same one the app shows), on the plain list only. It is a bonus: if it
  // can't be read, the list shows without it. Only an approved charity can be it, as it must be in this list.
  let featured: Row | null = null;
  if (!q && !category && charities.length > 0) {
    const { data: pick } = await supabase.from("featured_charities").select("charity_id").eq("week_start", weekStart(new Date())).maybeSingle();
    featured = charities.find((c) => c.id === pick?.charity_id) ?? null;
  }

  const nameOf = new Map(categories.map((c) => [c.id, c.name_en]));
  const causesOf = (c: Row) => c.charity_categories.map((cc) => nameOf.get(cc.category_id)).filter((n): n is string => Boolean(n));
  // The style guide's filter chips: the chosen one is solid blue. Big enough to tap (44 px).
  const chip = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-4 text-[15px] font-semibold transition-[transform,color,background-color,border-color] duration-150 active:scale-[0.97] motion-reduce:transition-none ${
      active ? "border-brand bg-brand text-white" : "border-border bg-surface text-navy hover:border-brand hover:text-brand"
    }`;
  const empty = charities.length === 0 ? emptyState(q, category ? { slug: category.slug, name: category.name_en } : null) : null;

  return (
    // full-bleed: this page runs edge to edge, with its own 1 200 px column (see globals.css).
    <div className="full-bleed overflow-x-clip">
      <section className="relative isolate">
        <span aria-hidden className="pointer-events-none absolute -left-40 -top-28 -z-10 h-[28rem] w-[28rem] rounded-full bg-honey-soft" />
        <span aria-hidden className="pointer-events-none absolute -right-24 top-24 -z-10 h-72 w-72 rounded-full bg-peach max-md:hidden" />
        <div className="mx-auto grid max-w-[75rem] items-end gap-6 px-4 pb-8 pt-8 sm:px-6 sm:pb-12 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <h1 className="font-display text-[clamp(2.75rem,8vw,5.25rem)] leading-[0.95] tracking-[-0.035em] text-balance">
              Find a <Key>charity</Key>
            </h1>
            <p className="max-w-[36rem] text-[clamp(1.0625rem,1.8vw,1.25rem)] leading-relaxed text-muted">
              Registered South African charities, checked by us before they can take a gift.
            </p>
            <CharitySearch initial={q} category={category?.slug ?? ""} />
            {categories.length > 0 ? (
              <nav aria-label="Causes" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                <Link href={causeHref(null, q)} className={chip(!category)} aria-current={!category ? "page" : undefined}>All</Link>
                {categories.map((c) => (
                  <Link key={c.id} href={causeHref(c.slug, q)} className={chip(c.id === category?.id)} aria-current={c.id === category?.id ? "page" : undefined}>
                    {c.name_en}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <Illustration name="findingTheWay" sparkle="stars" className="hidden w-56 lg:block" />
        </div>
      </section>

      {featured ? <CauseOfTheWeek charity={featured} causes={causesOf(featured)} /> : null}

      <section className="mx-auto max-w-[75rem] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10" aria-label="Results">
        {empty ? (
          <div className="relative isolate flex flex-col items-start gap-3 overflow-hidden rounded-[1.5rem] bg-honey-soft p-6 sm:p-8">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-32 w-32 rounded-full bg-peach" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/drop-lilac.png" alt="" aria-hidden className="h-12 w-auto" />
            <h2 role="status" className="font-display text-[1.5rem] leading-tight">{empty.title}</h2>
            <p className="max-w-[34rem] text-muted">{empty.body}</p>
            {empty.actions.length ? (
              <div className="flex flex-wrap gap-3 pt-1">
                {empty.actions.map((a, i) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={i === 0 ? "pressable inline-flex min-h-12 items-center rounded-[1.125rem] bg-brand px-5 font-bold text-white" : "inline-flex min-h-12 items-center rounded-[1.125rem] border-2 border-border bg-surface px-5 font-bold text-brand hover:border-brand"}
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p role="status" className="text-[15px] font-semibold text-muted">
            {resultsLine(charities.length, q, category?.name_en ?? null)}
          </p>
        )}
        {charities.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {charities.map((c, i) => (
              <li key={c.id} className="min-w-0">
                <CharityCard charity={c} causes={causesOf(c)} tone={coverTone(i)} />
              </li>
            ))}
          </ul>
        ) : null}
        <p className="pt-4 text-muted">
          Run a charity? <Link href="/apply" className="inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-4">List it here for free</Link>
        </p>
      </section>
    </div>
  );
}

/** A soft chip for a cause on a card. */
function CauseChip({ name, onBlue = false }: { name: string; onBlue?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${onBlue ? "bg-white/15 text-white" : "bg-honey-soft text-navy"}`}>
      {name}
    </span>
  );
}

/** The charity's logo, or its initials on a soft tile when it has none. */
function LogoTile({ name, logo, className }: { name: string; logo: string | null; className: string }) {
  return logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" loading="lazy" className={`${className} bg-surface object-cover`} />
  ) : (
    <span aria-hidden className={`${className} flex items-center justify-center bg-brand font-display font-bold text-white`}>{initials(name)}</span>
  );
}

/**
 * One charity: its cover photo (or a soft colour block with splashes), its logo over the edge, its name, where it
 * is, a line about it, its s18A status and causes, and the way in. The whole card is one link to its page.
 */
function CharityCard({ charity: c, causes, tone }: { charity: Row; causes: string[]; tone: string }) {
  const cover = publicImageUrl(c.cover_path);
  const area = [c.suburb, c.city].filter(Boolean).join(", ");
  return (
    <Link
      href={`/c/${c.slug}`}
      className="lift group flex h-full flex-col overflow-hidden rounded-[1.5rem] border-2 border-border bg-surface transition-colors hover:border-brand focus-visible:border-brand"
    >
      <div className={`relative aspect-[16/9] w-full overflow-hidden ${cover ? "bg-honey-soft" : tone}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <Bubbles
            items={[
              "-right-10 -top-12 h-36 w-36 bg-white/60",
              "left-[18%] top-[22%] h-4 w-4 bg-coral",
              "right-[30%] bottom-[18%] h-8 w-8 border-[4px] border-brand/30",
              "left-[46%] top-[14%] h-2.5 w-2.5 bg-brand",
            ]}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
        <LogoTile name={c.name_en} logo={publicImageUrl(c.logo_path)} className="relative z-10 -mt-8 h-16 w-16 shrink-0 rounded-[1.125rem] text-xl shadow-[0_0_0_4px_var(--surface),0_10px_24px_rgba(14,27,61,0.12)]" />
        <div className="min-w-0 space-y-1">
          <BilingualName en={c.name_en} as="h2" className="line-clamp-3 text-[1.25rem] leading-tight text-navy" />
          {area ? <p dir="auto" className="truncate text-sm text-muted">{area}</p> : null}
        </div>
        {c.description_en ? <p dir="auto" className="line-clamp-2 text-[15px] leading-relaxed text-muted">{c.description_en}</p> : null}
        <div className="flex flex-wrap gap-2">
          <CharityBadges charity={c} />
          {causes.map((n) => <CauseChip key={n} name={n} />)}
        </div>
        <span className="mt-auto flex items-center justify-between gap-3 pt-2 font-bold text-brand">
          View and give
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-brand"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </span>
      </div>
    </Link>
  );
}

/** The cause of the week: a blue colour block with splashes off the edges, and the page's one orange button. */
function CauseOfTheWeek({ charity: c, causes }: { charity: Row; causes: string[] }) {
  const cover = publicImageUrl(c.cover_path);
  return (
    <section aria-labelledby="cause-of-the-week" className="mx-auto max-w-[75rem] px-4 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-brand text-white">
        <Bubbles
          items={[
            { c: "-right-14 -top-16 h-40 w-40 bg-coral sm:-right-16 sm:-top-20 sm:h-56 sm:w-56", anim: "bob-slow" },
            { c: "-bottom-28 right-[18%] h-52 w-52 border-[18px] border-white/10" },
            { c: "right-[44%] top-8 h-4 w-4 bg-honey", anim: "bob" },
          ]}
        />
        <div className="relative grid gap-7 p-6 pt-24 sm:p-10 sm:pt-28 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-center md:pt-10">
          <div className="flex min-w-0 flex-col items-start gap-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[14px] font-semibold text-navy">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-coral" />
              Cause of the week
            </p>
            <h2 id="cause-of-the-week" dir="auto" className="font-display text-[clamp(1.875rem,4.4vw,3rem)] font-extrabold leading-[1.04] text-white!">{c.name_en}</h2>
            {c.description_en ? <p dir="auto" className="line-clamp-3 max-w-[34rem] text-[17px] leading-relaxed text-white/90">{c.description_en}</p> : null}
            <div className="flex flex-wrap gap-2">
              <CharityBadges charity={c} />
              {causes.map((n) => <CauseChip key={n} name={n} onBlue />)}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
              <Link href={`/c/${c.slug}/donate`} className="pressable inline-flex min-h-14 items-center rounded-[1.125rem] bg-coral px-8 text-[17px] font-bold text-navy">Give</Link>
              <Link href={`/c/${c.slug}`} className="inline-flex min-h-11 items-center font-bold text-white underline underline-offset-4">See their page</Link>
            </div>
          </div>
          <div className="min-w-0">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="aspect-[4/3] w-full rounded-[1.5rem] object-cover shadow-[0_24px_60px_rgba(14,27,61,0.28)]" />
            ) : (
              <div aria-hidden className="flex aspect-[4/3] w-full items-center justify-center rounded-[1.5rem] bg-white/95 max-md:hidden">
                <Splash className="h-auto w-[55%]" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
