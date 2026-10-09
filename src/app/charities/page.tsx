import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { CharityBadges } from "@/components/charity-badges";
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
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1.5 text-sm ${active ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface"}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Charities</h1>
      <form role="search" className="flex gap-2">
        {category ? <input type="hidden" name="category" value={category.slug} /> : null}
        <label htmlFor="q" className="sr-only">Search charities</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by name or area"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
      </form>
      <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={q ? `/charities?q=${encodeURIComponent(q)}` : "/charities"} className={chip(!category)}>All</Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/charities?category=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={chip(c.id === category?.id)}
          >
            {c.name_en}
          </Link>
        ))}
      </nav>

      {charities.length === 0 ? (
        <p className="text-sm text-muted">No charities match. Try a different word or category.</p>
      ) : null}
      <ul className="space-y-3">
        {charities.map((c) => {
          const logo = publicImageUrl(c.logo_path);
          return (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="flex gap-3 rounded-card border border-border bg-surface p-4">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-14 w-14 shrink-0 rounded-control border border-border object-cover" />
                ) : (
                  <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control bg-brand-soft font-bold text-brand">
                    {initials(c.name_en)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <BilingualName en={c.name_en} as="h2" className="text-lg font-semibold" />
                  {c.suburb || c.city ? <p className="text-sm text-muted">{[c.suburb, c.city].filter(Boolean).join(", ")}</p> : null}
                  {c.description_en ? <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description_en}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CharityBadges charity={c} />
                    {c.charity_categories.map((cc) => (
                      <Badge key={cc.category_id}>{nameOf.get(cc.category_id)}</Badge>
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">
        Run a charity? <Link href="/apply" className="text-brand underline">List it here for free</Link>.
      </p>
    </div>
  );
}
