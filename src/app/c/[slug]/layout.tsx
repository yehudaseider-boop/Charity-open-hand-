import { notFound } from "next/navigation";
import { cache } from "react";
import { ChromeMark } from "@/components/chrome-mark";
import { currentFocus } from "@/lib/focus-server";
import { createClient } from "@/lib/supabase/server";

/** Is there a listed (approved) charity at this address? Only its id is read. */
const charityListed = cache(async (slug: string) => {
  const { data, error } = await (await createClient()).from("charities").select("id").eq("slug", slug).eq("status", "approved").maybeSingle();
  // A read that failed is not "no such charity": the page then shows its own error with Try again, not "not found".
  return error ? true : Boolean(data);
});

/**
 * A charity's pages (its page and its give page). Arrived from the charity's own link (lib/focus.ts): the header and
 * footer show only that charity. In the layout, so the right header shows before the page has loaded.
 * An address with no listed charity is turned away here, before the page's loading placeholder starts the response,
 * so it gets a real "not found" (404) and search engines don't keep it (11/11/2026).
 */
export default async function CharityLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  if (!(await charityListed((await params).slug))) notFound();
  return (
    <>
      {(await currentFocus()) ? <ChromeMark kind="focus" /> : null}
      {children}
    </>
  );
}
