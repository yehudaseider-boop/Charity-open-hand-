import Link from "next/link";
import { BilingualName } from "@/components/bilingual-name";
import type { DashboardCharity } from "@/lib/charity/dashboard";

const tabs = [
  { key: "overview", label: "Overview", href: "" },
  { key: "donations", label: "Donations", href: "/donations" },
] as const;

/** Charity name and the dashboard tabs. */
export function DashboardNav({ charity, current }: { charity: DashboardCharity; current: (typeof tabs)[number]["key"] }) {
  return (
    <div className="space-y-3">
      <div>
        <Link href="/charity-admin" className="text-sm text-muted">← Your charities</Link>
        <BilingualName en={charity.name_en} he={charity.name_he} as="h1" className="mt-1 text-xl font-semibold" />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-border text-sm" aria-label="Dashboard">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/charity-admin/${charity.id}${t.href}`}
            aria-current={t.key === current ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${
              t.key === current ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
