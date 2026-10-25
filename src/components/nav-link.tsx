"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A header link that shows which section you are in (and tells screen readers). */
export function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const path = usePathname();
  const here = path === href || path.startsWith(`${href}/`) || (href === "/charities" && path.startsWith("/c/"));
  return (
    <Link
      href={href}
      aria-current={here ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full px-2.5 sm:px-3 font-semibold transition-colors hover:bg-honey-soft ${here ? "bg-honey-soft text-brand" : "text-navy"} ${className}`}
    >
      {children}
    </Link>
  );
}
