"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentTabInView } from "@/components/use-current-tab-in-view";

/** The admin area's pages, grouped the way the work comes: review, content, people. */
const groups = [
  {
    title: "Review",
    tabs: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/charities", label: "Charities" },
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/receipts", label: "Receipts" },
    ],
  },
  { title: "Content", tabs: [{ href: "/admin/featured", label: "Cause of the week" }, { href: "/admin/causes", label: "Causes" }] },
  { title: "People", tabs: [{ href: "/admin/requests", label: "Privacy requests" }] },
  { title: "Setup", tabs: [{ href: "/admin/settings", label: "Settings check" }] },
];

/**
 * The admin pages: a grouped list down the side on a laptop, one scrolling row on a phone, the same
 * way the charity dashboard does it. The page you're on is marked (aria-current) in both.
 */
export function AdminNav() {
  const pathname = usePathname();
  const row = useCurrentTabInView<HTMLUListElement>(pathname);
  const isActive = (t: { href: string; exact?: boolean }) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`));
  return (
    <nav aria-label="Admin" className="print:hidden">
      {/* Phone and tablet: one row that scrolls sideways inside itself. */}
      <ul ref={row} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {groups.flatMap((g) => g.tabs).map((t) => {
          const active = isActive(t);
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
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
                  <li key={t.href}>
                    <Link
                      href={t.href}
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
