import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { requirePlatformAdmin } from "@/lib/auth";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: charities } = await supabase.from("charities").select("status");

  const counts = new Map<string, number>();
  for (const c of charities ?? []) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const waiting = counts.get("pending_review") ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Platform admin</h1>
      <Link href="/admin/charities?status=pending_review"
        className="block rounded-card border border-border bg-surface p-5">
        <p className="text-3xl font-semibold">{waiting}</p>
        <p className="text-sm text-muted">{waiting === 1 ? "application" : "applications"} waiting for review</p>
      </Link>
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
