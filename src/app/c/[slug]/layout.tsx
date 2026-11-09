import { ChromeMark } from "@/components/chrome-mark";
import { currentFocus } from "@/lib/focus-server";

/**
 * A charity's pages (its page and its give page). Arrived from the charity's own link (lib/focus.ts): the header and
 * footer show only that charity. In the layout, so the right header shows before the page has loaded.
 */
export default async function CharityLayout({ children }: LayoutProps<"/c/[slug]">) {
  return (
    <>
      {(await currentFocus()) ? <ChromeMark kind="focus" /> : null}
      {children}
    </>
  );
}
