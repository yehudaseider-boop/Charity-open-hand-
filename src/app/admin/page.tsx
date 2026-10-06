import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: charities } = await supabase.from("charities").select("status");

  const counts = new Map<string, number>();
  for (const c of charities ?? []) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Platform admin</h1>
      <section className="rounded-card bg-surface border border-border p-5">
        <h2 className="font-semibold">Charities by status</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {["pending_review", "approved", "rejected", "suspended", "draft"].map((s) => (
            <li key={s} className="flex justify-between">
              <span className="capitalize">{s.replace("_", " ")}</span>
              <span>{counts.get(s) ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-muted">The approval queue arrives in milestone 2.</p>
    </div>
  );
}
