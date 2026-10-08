"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "", label: "Overview", exact: true },
  { href: "/donations", label: "Donations" },
  { href: "/donors", label: "Donors" },
  { href: "/receipts", label: "Receipts" },
  { href: "/application", label: "Registration" },
  { href: "/profile", label: "Public profile" },
];

/** Tabs across the top of every page for one charity. */
export function CharityNav({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/charity-admin/${id}`;
  return (
    <nav aria-label="Charity" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.label}
            href={href}
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
