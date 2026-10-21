"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "", label: "Overview", exact: true },
  { href: "/donations", label: "Donations" },
  { href: "/donors", label: "Donors" },
  { href: "/monthly", label: "Monthly donations" },
  { href: "/thank-donors", label: "Thank donors" },
  { href: "/email-donors", label: "Email donors" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/receipts", label: "s18A receipts" },
  { href: "/report", label: "Annual report" },
  { href: "/application", label: "Application" },
  { href: "/profile", label: "Public profile" },
  { href: "/updates", label: "Photos and updates" },
  { href: "/team", label: "Team" },
];

/** Tabs across the top of every page for one charity, on the blue header. */
export function CharityNav({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/charity-admin/${id}`;
  return (
    <nav aria-label="Charity" className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-2 text-sm print:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 font-medium transition-colors ${active ? "bg-white text-navy" : "bg-white/10 text-white hover:bg-white/20"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
