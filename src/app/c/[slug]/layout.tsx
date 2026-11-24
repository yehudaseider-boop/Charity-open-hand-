import { notFound } from "next/navigation";
import { ChromeMark } from "@/components/chrome-mark";
import { currentFocus } from "@/lib/focus-server";
import { charityIsListed } from "@/lib/charity/public-cache";

/**
 * A charity's pages (its page and its give page). Arrived from the charity's own link (lib/focus.ts): the header and
 * footer show only that charity. In the layout, so the right header shows before the page has loaded.
 * An address with no listed charity is turned away here, before the page's loading placeholder starts the response,
 * so it gets a real "not found" (404) and search engines don't keep it (11/11/2026). The check is the same cached read the
 * pages use (24/11/2026), so a suspended or unlisted charity stops showing within a minute, and at once when an admin acts.
 */
export default async function CharityLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  // Both at once (24/11/2026): the second used to wait for the first.
  const [listed, focus] = await Promise.all([params.then((p) => charityIsListed(p.slug)), currentFocus()]);
  if (!listed) notFound();
  return (
    <>
      {focus ? <ChromeMark kind="focus" /> : null}
      {children}
    </>
  );
}
