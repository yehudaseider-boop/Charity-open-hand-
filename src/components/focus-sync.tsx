"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * The header and footer sit in the site's layout, which isn't redrawn when moving between pages inside the
 * site, so the "only this charity" look (see lib/focus.ts) would stay on pages that aren't that charity's.
 * When the page no longer belongs to the focused charity, this reloads it once, so the server draws the
 * full header and footer (30/10/2026). A soft refresh proved unreliable here; this happens only on leaving.
 */
export function FocusSync({ slug }: { slug: string }) {
  const path = usePathname();
  const ours = path === `/c/${slug}` || path.startsWith(`/c/${slug}/`) || path.startsWith("/donate/return");
  useEffect(() => {
    if (!ours) window.location.replace(window.location.href);
  }, [ours]);
  return null;
}
