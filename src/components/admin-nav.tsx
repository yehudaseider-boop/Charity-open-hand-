"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/charities", label: "Charities" },
  { href: "/admin/receipts", label: "Receipts" },
  { href: "/admin/requests", label: "Privacy requests" },
];

/** Tabs across the top of every NEDIV lev admin page. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 ${active ? "border-brand bg-brand-soft text-brand" : "border-border"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
