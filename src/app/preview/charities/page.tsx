import type { Metadata } from "next";
import { CharitiesView, typedQuery } from "@/app/charities/view";

export const metadata: Metadata = {
  title: "Charities: redesign (preview)",
  robots: { index: false, follow: false },
};

/**
 * Find a charity with the blue opening (preview, 27/11/2026, Yehuda: "yes"). The real page is unchanged until he
 * approves this one. A search or a cause typed here goes on to the real page.
 */
export default async function CharitiesRedesignPreview({ searchParams }: PageProps<"/preview/charities">) {
  const params = await searchParams;
  return <CharitiesView look="blue" q={typedQuery(params.q)} categorySlug={typeof params.category === "string" ? params.category : ""} />;
}
