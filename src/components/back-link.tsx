"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { previousPath } from "@/components/route-memory";

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
      className="text-sm font-semibold text-muted transition hover:text-brand focus-visible:text-brand"
      onClick={(e) => {
        // Only when the page just before this one really was that list (see RouteMemory).
        if (previousPath() === href.split("?")[0] && history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </Link>
  );
}
