import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { glow } from "@/components/card";
import { PageHeader, secondaryAction } from "@/components/dash";
import { requireCharityAdmin } from "@/lib/auth";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your charities", robots: { index: false, follow: false } };

export default async function CharityAdminPage() {
  const viewer = await requireCharityAdmin();
  // Givezy staff who help run no charity have nothing to list here: the admin area is theirs.
  if (viewer.charities.length === 0 && viewer.isPlatformAdmin) redirect("/admin");
  return (
    <div className="space-y-5">
      <PageHeader title="Your charities" intro="Open a charity to see its dashboard." />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {viewer.charities.map((c) => {
          const status = statusLabels[c.status as CharityStatus];
          return (
            // The whole box opens the dashboard (the name's link stretches over it); the two smaller links sit above it.
            <li key={c.id} className={`group relative rounded-card border-2 border-border bg-surface p-5 sm:p-6 ${glow} has-[>a:focus-visible]:ring-2 has-[>a:focus-visible]:ring-brand has-[>a:focus-visible]:ring-offset-2`}>
              <Link
                href={`/charity-admin/${c.id}`}
                className="block min-w-0 rounded-control after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none"
              >
                <BilingualName en={c.name_en} he={c.name_he} as="h2" className="font-display text-xl font-bold text-indigo [overflow-wrap:anywhere] group-hover:text-brand" />
                <span className="sr-only">: open the dashboard</span>
              </Link>
              <div className="mt-2"><Badge tone={status.tone}>{status.label}</Badge></div>
              <p aria-hidden className="mt-4 text-sm font-semibold text-brand">
                Dashboard <span className="inline-block transition-transform motion-safe:group-hover:translate-x-0.5">→</span>
              </p>
              <div className="relative z-10 mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                <Link href={`/charity-admin/${c.id}/application`} className={secondaryAction}>Application</Link>
                <Link href={`/charity-admin/${c.id}/profile`} className={secondaryAction}>Public profile</Link>
              </div>
            </li>
          );
        })}
      </ul>
      <Link href="/apply" className="inline-block text-sm text-brand underline">Apply to list another organisation</Link>
    </div>
  );
}
