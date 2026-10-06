import type { Metadata } from "next";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { requireCharityAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Charity admin" };

export default async function CharityAdminPage() {
  const viewer = await requireCharityAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Your charities</h1>
      {viewer.charities.map((c) => (
        <section key={c.id} className="rounded-card bg-surface border border-border p-5">
          <BilingualName en={c.name_en} he={c.name_he} as="h2" className="font-semibold" />
          <div className="mt-2"><Badge>{c.status.replace("_", " ")}</Badge></div>
          <p className="mt-3 text-sm text-muted">
            Profile editing, donations and receipts arrive in later milestones.
          </p>
        </section>
      ))}
    </div>
  );
}
