"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A header link that shows which section you are in (and tells screen readers). */
/** `tone="dark"`: for a header on a blue ground (the home page): white words, a soft white highlight. */
export function NavLink({ href, children, className = "", tone = "light" }: { href: string; children: React.ReactNode; className?: string; tone?: "light" | "dark" }) {
  const path = usePathname();
  const here = path === href || path.startsWith(`${href}/`) || (href === "/charities" && path.startsWith("/c/"));
  return (
    <Link
      href={href}
      aria-current={here ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full px-2.5 sm:px-3 font-semibold transition-colors ${tone === "dark" ? `hover:bg-white/15 ${here ? "bg-white/15 text-white" : "text-white/90 hover:text-white"}` : `hover:bg-honey-soft ${here ? "bg-honey-soft text-brand" : "text-navy"}`} ${className}`}
    >
      {children}
    </Link>
  );
}
