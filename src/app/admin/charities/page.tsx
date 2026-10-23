import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { requirePlatformAdmin } from "@/lib/auth";
import { statusLabels, type CharityStatus } from "@/lib/charity/status";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/card";
import { InviteForm } from "./invite/form";

export const metadata: Metadata = { title: "Charities" };

/** Past its last day (read at request time). */
const hasExpired = (expiresAt: string) => new Date(expiresAt).getTime() < Date.now();

const tabs: CharityStatus[] = ["pending_review", "approved", "rejected", "suspended", "draft"];

export default async function AdminCharitiesPage({ searchParams }: PageProps<"/admin/charities">) {
  await requirePlatformAdmin();
  const { status: raw } = await searchParams;
  const status = tabs.includes(raw as CharityStatus) ? (raw as CharityStatus) : "pending_review";

  const supabase = await createClient();
  const { data: charities, error } = await supabase
    .from("charities")
    .select("id, name_en, name_he, s18a_reference, updated_at")
    .eq("status", status)
    .order("updated_at", { ascending: status !== "pending_review" ? false : true });
  if (error) throw error;
  const { data: invites } = await supabase
    .from("charity_invites")
    .select("id, charity_name, contact_email, created_at, expires_at, used_at, charity_id")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-muted">← Platform admin</Link>
      <h1 className="font-display text-2xl text-indigo">Charities</h1>
      <Card title="Invite a charity">
        <InviteForm />
        {invites?.length ? (
          <ul className="mt-4 divide-y divide-border border-t border-border text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {i.charity_name} <span className="text-muted">({i.contact_email}, {formatDate(i.created_at)})</span>
                </span>
                <span className="text-muted">
                  {i.used_at ? (i.charity_id ? <Link href={`/admin/charities/${i.charity_id}`} className="text-brand underline">Started</Link> : "Started") : hasExpired(i.expires_at) ? "Expired" : "Sent"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <nav aria-label="Show charities" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/admin/charities?status=${t}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 ${t === status ? "border-brand bg-brand-soft text-indigo" : "border-border"}`}
          >
            {statusLabels[t].label}
          </Link>
        ))}
      </nav>
      {charities.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : null}
      <ul className="space-y-2">
        {charities.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/charities/${c.id}`} className="block rounded-card border border-border bg-surface p-4">
              <BilingualName en={c.name_en} he={c.name_he} className="font-medium" />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {c.s18a_reference ? <Badge>Applying as s18A</Badge> : <Badge>No s18A</Badge>}
                <span>Updated {formatDate(c.updated_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
