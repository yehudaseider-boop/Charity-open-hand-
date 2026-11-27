import type { Metadata } from "next";
import { GivePage } from "@/app/c/[slug]/donate/give-page";

/** As the real give page: room for a slow payment provider to answer (see app/c/[slug]/donate/page.tsx). */
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Give: redesign (preview)",
  robots: { index: false, follow: false },
};

/**
 * The give form in its flatter look (preview, 27/11/2026, Yehuda: "Start"). The same page as /c/<charity>/donate,
 * loading, checking and sending exactly as it does; only the form's look differs. The real page is unchanged.
 */
export default async function GiveRedesignPreview({ params, searchParams }: PageProps<"/preview/give/[slug]">) {
  return <GivePage slug={(await params).slug} sp={await searchParams} look="flat" />;
}
