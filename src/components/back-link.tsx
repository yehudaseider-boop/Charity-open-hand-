"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "← Donors" on a detail page. When the person came from that list (same site, same path), going back
 * returns them to the list as they left it, filters and page number included; otherwise it is a plain
 * link to the list.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className="text-sm text-muted"
      onClick={(e) => {
        let from: URL | null = null;
        try { from = document.referrer ? new URL(document.referrer) : null; } catch { from = null; }
        if (from && from.origin === location.origin && from.pathname === href.split("?")[0] && history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </Link>
  );
}
