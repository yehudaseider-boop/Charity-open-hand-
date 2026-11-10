import type { Metadata } from "next";
import { CharitiesView } from "@/app/charities/view";

// The plain charities list, built ahead and served from cache near the visitor, rebuilt at most every 5 minutes so a
// new charity shows within minutes (09/11/2026). Visitors never see this address: the proxy sends /charities here
// when there is no search or cause, so this page IS the /charities search engines see: no robots rule of its own, and a
// canonical pointing at /charities, so this address is never listed as a second page.
export const revalidate = 300;
export const metadata: Metadata = { title: "Charities", alternates: { canonical: "/charities" } };

export default function BrowseCharitiesPage() {
  return <CharitiesView q="" categorySlug="" />;
}
