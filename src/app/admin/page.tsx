import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { requirePlatformAdmin } from "@/lib/auth";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { countCharitiesByStatus } from "@/lib/charity/status-counts";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Givezy admin" };

export default async function AdminPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const counts = await countCharitiesByStatus(supabase);
  const waiting = counts.get("pending_review") ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-indigo">Overview</h1>
      <Link
        href="/admin/charities?status=pending_review"
        className="block rounded-card bg-indigo p-5 text-white transition hover:brightness-110 sm:p-6"
      >
        <p className="text-sm font-medium text-honey-soft">Waiting for review</p>
        <p className="mt-1 font-display text-4xl leading-tight">{waiting}</p>
        <p className="mt-1 text-sm text-white/80">{waiting === 1 ? "application" : "applications"} waiting for a person to look at them</p>
      </Link>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: "/admin/payments", title: "Payments", body: "Anything stuck or held, monthly donations, and what came in by charity" },
          { href: "/admin/receipts", title: "s18A receipts", body: "See issued receipts and withdraw one if it is wrong" },
          { href: "/admin/requests", title: "Privacy requests", body: "People asking to correct, delete or stop use of their information" },
          { href: "/admin/featured", title: "Cause of the week", body: "Choose the cause shown first on the home page" },
          { href: "/admin/charity-requests", title: "Charity requests", body: "Charities donors asked for that aren't on Givezy yet" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="block rounded-card border-2 border-border bg-surface p-5 transition hover:border-brand">
            <p className="font-display text-lg font-bold text-indigo">{l.title}</p>
            <p className="mt-1 text-sm text-muted">{l.body}</p>
          </Link>
        ))}
      </div>
      <Card title="Charities by status">
        <ul className="space-y-1 text-sm">
          {(Object.keys(statusLabels) as CharityStatus[]).map((s) => (
            <li key={s}>
              <Link href={`/admin/charities?status=${s}`} className="flex justify-between">
                <span>{statusLabels[s].label}</span>
                <span>{counts.get(s) ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
