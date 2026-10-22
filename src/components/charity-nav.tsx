"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The dashboard's pages, grouped the way a charity thinks about them. */
const groups = [
  {
    title: "Giving",
    tabs: [
      { href: "", label: "Overview", exact: true },
      { href: "/donations", label: "Donations" },
      { href: "/monthly", label: "Monthly donations" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/receipts", label: "s18A receipts" },
      { href: "/report", label: "Annual report" },
    ],
  },
  {
    title: "People",
    tabs: [
      { href: "/donors", label: "Donors" },
      { href: "/thank-donors", label: "Thank donors" },
      { href: "/email-donors", label: "Email donors" },
      { href: "/team", label: "Team" },
    ],
  },
  {
    title: "Your page",
    tabs: [
      { href: "/profile", label: "Public profile" },
      { href: "/updates", label: "Photos and updates" },
    ],
  },
  {
    title: "Set-up",
    tabs: [{ href: "/application", label: "Application" }],
  },
];

/**
 * The dashboard's pages: a grouped list down the side on a laptop, one scrolling row on a phone.
 * The page you're on is marked (aria-current) the same way in both.
 */
export function CharityNav({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/charity-admin/${id}`;
  const isActive = (t: { href: string; exact?: boolean }) => {
    const href = `${base}${t.href}`;
    return t.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };
  return (
    <nav aria-label="Charity dashboard" className="print:hidden">
      {/* Phone and tablet: one row that scrolls sideways inside itself. */}
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {groups.flatMap((g) => g.tabs).map((t) => {
          const active = isActive(t);
          return (
            <li key={t.label} className="shrink-0">
              <Link
                href={`${base}${t.href}`}
                aria-current={active ? "page" : undefined}
                className={`inline-block rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${active ? "border-brand bg-brand text-white" : "border-border bg-surface text-navy hover:border-brand"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Laptop: grouped, down the side. */}
      <div className="hidden space-y-6 lg:block">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1.5">
            <p className="px-3 text-xs font-bold text-muted">{g.title}</p>
            <ul className="space-y-0.5">
              {g.tabs.map((t) => {
                const active = isActive(t);
                return (
                  <li key={t.label}>
                    <Link
                      href={`${base}${t.href}`}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-control px-3 py-2 text-[15px] font-semibold transition ${active ? "bg-brand text-white" : "text-navy hover:bg-honey-soft"}`}
                    >
                      {t.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
