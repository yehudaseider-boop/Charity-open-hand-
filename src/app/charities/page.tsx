import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { CharityBadges } from "@/components/charity-badges";
import { Chevron } from "@/components/chevron";
import { CharitySearch } from "@/components/charity-search";
import { Illustration } from "@/components/illustration";
import { Bubbles } from "@/components/marketing";
import { initials } from "@/lib/charity/initials";
import { loadCategories, publicImageUrl } from "@/lib/charity/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Charities" };

/** Keep only letters, digits, spaces and apostrophes. */
function cleanQuery(q: unknown): string {
  return typeof q === "string" ? q.replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

export default async function CharitiesPage({ searchParams }: PageProps<"/charities">) {
  const params = await searchParams;
  const q = cleanQuery(params.q);
  const categorySlug = typeof params.category === "string" ? params.category : "";

  const supabase = await createClient();
  const categories = await loadCategories();
  const category = categories.find((c) => c.slug === categorySlug);

  // Row-level security only returns approved charities to the public.
  let query = supabase
    .from("charities")
    .select("id, slug, name_en, description_en, logo_path, suburb, city, is_verified, is_s18a, mandate_signed_at, charity_categories(category_id)")
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
  const { data: charities, error } = await query;
  if (error) throw error;

  const nameOf = new Map(categories.map((c) => [c.id, c.name_en]));
  // The style guide's filter chips: the chosen one is solid blue.
  const chip = (active: boolean) =>
    `inline-block shrink-0 rounded-full border-2 px-4 py-2 font-semibold transition ${active ? "border-brand bg-brand text-white" : "border-border bg-surface text-navy hover:border-brand"}`;
  const count = `${charities.length} ${charities.length === 1 ? "charity" : "charities"}`;

  return (
    // full-bleed: this page runs edge to edge, with its own 1 200 px column (see globals.css).
    <div className="full-bleed overflow-x-clip">
      <section className="relative overflow-hidden bg-honey-soft">
        <Bubbles
          className="hidden md:block"
          items={[
            { c: "-right-24 -top-24 h-80 w-80 bg-peach" },
            { c: "-left-16 bottom-6 h-28 w-28 bg-honey", anim: "bob-slow" },
            { c: "right-[38%] top-10 h-5 w-5 bg-coral", anim: "bob" },
            { c: "right-[30%] bottom-10 h-9 w-9 border-[4px] border-brand", anim: "bob-slow" },
            { c: "left-[46%] top-16 h-3 w-3 bg-brand" },
          ]}
        />
        <Illustration name="findingTheWay" sparkle="stars" className="absolute bottom-0 right-[max(1.5rem,calc(50%-36rem))] hidden w-52 lg:block" />
        <div className="relative mx-auto max-w-[75rem] space-y-5 px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-14">
          <h1 className="text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.02] text-balance">Find a charity</h1>
          <p className="max-w-[36rem] text-lg text-muted">Registered South African charities, checked by us before they can take a gift.</p>
          <CharitySearch initial={q} category={category?.slug ?? ""} />
          {categories.length > 0 ? (
            <nav aria-label="Causes" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
              <Link href={q ? `/charities?q=${encodeURIComponent(q)}` : "/charities"} className={chip(!category)} aria-current={!category ? "page" : undefined}>All</Link>
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/charities?category=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={chip(c.id === category?.id)}
                  aria-current={c.id === category?.id ? "page" : undefined}
                >
                  {c.name_en}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-[75rem] space-y-5 px-4 py-8 sm:px-6 sm:py-10" aria-label="Results">
        {charities.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-card border-2 border-border p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/drop-lilac.png" alt="" aria-hidden className="h-12 w-auto" />
            <h2 className="font-display text-xl font-bold">{q || category ? "No charities match" : "No charities yet"}</h2>
            <p className="text-muted">
              {q || category ? `Nothing for ${q ? `“${q}”` : ""}${q && category ? " in " : ""}${category ? category.name_en : ""}. Try a different word or cause.` : "The first charities are joining now. Check back soon."}
            </p>
            {q || category ? <Link href="/charities" className="font-bold text-brand underline underline-offset-4">See all charities</Link> : null}
          </div>
        ) : (
          <p role="status" className="text-sm font-semibold text-muted">
            {count}{q ? ` for “${q}”` : ""}{category ? ` in ${category.name_en}` : ""}
          </p>
        )}
        <ul className="grid gap-4 md:grid-cols-2">
          {charities.map((c, i) => {
            const logo = publicImageUrl(c.logo_path);
            return (
              <li key={c.id}>
                <Link href={`/c/${c.slug}`} className="lift group flex h-full gap-4 rounded-card border-2 border-border bg-surface p-5 transition-colors hover:border-brand">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" className="h-16 w-16 shrink-0 rounded-control border border-border object-cover" />
                  ) : (
                    <div aria-hidden className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-control font-display text-xl font-bold text-brand ${i % 2 ? "bg-brand-soft" : "bg-peach"}`}>
                      {initials(c.name_en)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <BilingualName en={c.name_en} as="h2" className="text-lg font-bold text-navy" />
                    {c.suburb || c.city ? <p className="text-sm text-muted">{[c.suburb, c.city].filter(Boolean).join(", ")}</p> : null}
                    {c.description_en ? <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted">{c.description_en}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CharityBadges charity={c} />
                      {c.charity_categories.map((cc) => (
                        <Badge key={cc.category_id}>{nameOf.get(cc.category_id)}</Badge>
                      ))}
                    </div>
                  </div>
                  <span className="self-center transition-transform group-hover:translate-x-1"><Chevron /></span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="pt-4 text-muted">
          Run a charity? <Link href="/apply" className="inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-4">List it here for free</Link>
        </p>
      </section>
    </div>
  );
}
