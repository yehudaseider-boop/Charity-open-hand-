import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { charityBadges } from "@/lib/charities";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Charities" };

export default async function CharitiesPage() {
  const supabase = await createClient();
  // Row-level security only returns approved charities to the public.
  const { data: charities, error } = await supabase
    .from("charities")
    .select("id, slug, name_en, name_he, description_en, is_verified, is_s18a, mandate_signed_at, charity_categories(categories(name_en))")
    .eq("status", "approved")
    .order("name_en");

  if (error) throw error;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Charities</h1>
      <ul className="space-y-3">
        {(charities ?? []).map((c) => {
          const badges = charityBadges(c);
          const categories = c.charity_categories
            .map((cc) => (cc.categories as unknown as { name_en: string } | null)?.name_en)
            .filter(Boolean);
          return (
            <li key={c.id} className="rounded-card bg-surface border border-border p-4">
              <BilingualName en={c.name_en} he={c.name_he} as="h2" className="font-semibold" />
              {c.description_en ? <p className="mt-2 text-sm text-muted">{c.description_en}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.verified ? <Badge tone="brand">Verified</Badge> : null}
                {badges.s18a ? <Badge tone="success">s18A</Badge> : null}
                {badges.noReceipts ? <Badge tone="warning">No 18A receipts</Badge> : null}
                {categories.map((name) => (
                  <Badge key={name}>{name}</Badge>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
