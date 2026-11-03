import { jsonLdString } from "@/lib/seo/structured-data";

/** Structured data for search engines and chatbots (a plain script tag, as Next.js recommends: it isn't code that runs). */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
