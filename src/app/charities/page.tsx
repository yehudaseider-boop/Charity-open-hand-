import type { Metadata } from "next";
import { CharitiesView, typedQuery } from "./view";

export const metadata: Metadata = { title: "Charities" };

/**
 * A search or a cause on the charities list, built per visit. The plain list (no search, no cause) is served from
 * cache: the proxy sends it to app/browse-charities, which shows the same view (09/11/2026).
 */
export default async function CharitiesPage({ searchParams }: PageProps<"/charities">) {
  const params = await searchParams;
  return <CharitiesView q={typedQuery(params.q)} categorySlug={typeof params.category === "string" ? params.category : ""} />;
}
