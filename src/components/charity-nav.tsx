"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentTabInView } from "@/components/use-current-tab-in-view";
import { donorJourneysHref, inDonorJourneys } from "@/lib/charity/donor-journey-tabs";

/** The menu's one item for the "Donor journeys" area; it opens the first of the area's pages this person can use. */
const DONOR_JOURNEYS = "#donor-journeys";

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
      // Keeping donors, thanking, journeys and emails under one item, with tabs on each page (23/11/2026).
      { href: DONOR_JOURNEYS, label: "Donor journeys" },
      { href: "/team", label: "Team" },
      { href: "/activity", label: "Activity" },
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
export function CharityNav({ id, base: baseOverride, hidden = [] }: { id: string; base?: string; hidden?: string[] }) {
  const pathname = usePathname();
  const row = useCurrentTabInView<HTMLUListElement>(pathname);
  const base = baseOverride ?? `/charity-admin/${id}`;
  const isActive = (t: { href: string; exact?: boolean }) => {
    if (t.href === DONOR_JOURNEYS) return pathname.startsWith(`${base}/`) && inDonorJourneys(pathname.slice(base.length));
    const href = `${base}${t.href}`;
    return t.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };
  // The area's item opens its first page this person can use, and is left out when they can use none of them.
  const areaHref = donorJourneysHref(hidden);
  const shown = (tabs: { href: string; label: string; exact?: boolean }[]) =>
    tabs.flatMap((t) => (t.href === DONOR_JOURNEYS ? (areaHref ? [{ ...t, to: areaHref }] : []) : hidden.includes(t.href) ? [] : [{ ...t, to: t.href }]));
  return (
    <nav aria-label="Charity dashboard" className="print:hidden">
      {/* Phone and tablet: one row that scrolls sideways inside itself. */}
      <ul ref={row} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {shown(groups.flatMap((g) => g.tabs)).map((t) => {
          const active = isActive(t);
          return (
            <li key={t.label} className="shrink-0">
              <Link
                href={`${base}${t.to}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-semibold transition ${active ? "border-brand bg-brand text-white" : "border-outline bg-surface text-navy hover:border-brand"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Laptop: grouped, down the side. */}
      <div className="hidden space-y-4 lg:block">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1">
            <p className="px-3 text-xs font-semibold text-muted">{g.title}</p>
            <ul className="space-y-0.5">
              {shown(g.tabs).map((t) => {
                const active = isActive(t);
                return (
                  <li key={t.label}>
                    <Link
                      href={`${base}${t.to}`}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-control px-3 py-1.5 text-[15px] font-semibold transition ${active ? "bg-brand text-white" : "text-navy hover:bg-honey-soft"}`}
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
