import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { requireCharityAdmin } from "@/lib/auth";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your charities", robots: { index: false, follow: false } };

export default async function CharityAdminPage() {
  const viewer = await requireCharityAdmin();
  // Givezy staff who help run no charity have nothing to list here: the admin area is theirs.
  if (viewer.charities.length === 0 && viewer.isPlatformAdmin) redirect("/admin");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Your charities</h1>
      {viewer.charities.map((c) => {
        const status = statusLabels[c.status as CharityStatus];
        return (
          <section key={c.id} className="rounded-card border border-border bg-surface p-5">
            <BilingualName en={c.name_en} he={c.name_he} as="h2" className="font-semibold" />
            <div className="mt-2"><Badge tone={status.tone}>{status.label}</Badge></div>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Link href={`/charity-admin/${c.id}`} className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">
                Dashboard
              </Link>
              <Link href={`/charity-admin/${c.id}/application`} className="rounded-control border border-border px-3 py-2">
                Application
              </Link>
              <Link href={`/charity-admin/${c.id}/profile`} className="rounded-control border border-border px-3 py-2">
                Public profile
              </Link>
            </div>
          </section>
        );
      })}
      <Link href="/apply" className="inline-block text-sm text-brand underline">Apply to list another organisation</Link>
    </div>
  );
}
