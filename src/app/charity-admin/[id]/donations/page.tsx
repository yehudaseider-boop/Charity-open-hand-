import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { donationStatus, donorName, isDonationStatus, safeSearch } from "@/lib/charity/dashboard";
import { DONATION_FIELDS, type DonationRow } from "@/lib/charity/dashboard-queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Donations" };

const PAGE = 25;
const filters = ["all", "paid", "pending", "failed", "refunded", "charged_back"] as const;

export default async function DonationsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donations">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donations`);
  await loadCharityForManager(id);
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : "all";
  const status = raw !== "all" && isDonationStatus(raw) ? raw : "all";
  const q = safeSearch(typeof sp.q === "string" ? sp.q : "");
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const supabase = await createClient();
  let query = supabase
    .from("charity_donations")
    .select(DONATION_FIELDS, { count: "exact" })
    .eq("charity_id", id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (status !== "all") query = query.eq("status", status);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`first_name.ilike.${like},last_name.ilike.${like},organisation_name.ilike.${like},email.ilike.${like}`);
  }
  const { data, count, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as unknown as DonationRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  const base = `/charity-admin/${id}/donations`;
  const href = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const merged = { status, q, page: 1, ...over };
    if (merged.status !== "all") p.set("status", String(merged.status));
    if (merged.q) p.set("q", String(merged.q));
    if (Number(merged.page) > 1) p.set("page", String(merged.page));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">Donations</h1>
        <a href={`/charity-admin/${id}/export/donations${status !== "all" ? `?status=${status}` : ""}`} className="text-sm text-brand underline">Download CSV</a>
      </div>

      <form action={base} className="flex gap-2">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search by donor name or email"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
      </form>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        {filters.map((f) => (
          <Link
            key={f}
            href={href({ status: f })}
            className={`shrink-0 rounded-full border px-3 py-1.5 ${f === status ? "border-brand bg-brand-soft text-brand" : "border-border"}`}
          >
            {f === "all" ? "All" : donationStatus[f].label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{q || status !== "all" ? "No donations match." : "No donations yet. They appear here as soon as someone starts one."}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => {
            const s = donationStatus[d.status];
            return (
              <li key={d.id}>
                <Link href={`${base}/${d.id}`} className="block rounded-card border border-border bg-surface p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{donorName(d)}</p>
                      <p className="text-muted">{formatDate(d.paid_at ?? d.created_at)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {d.wants_18a ? <Badge tone="brand">18A requested</Badge> : null}
                        {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                      </div>
                    </div>
                    <p className="shrink-0 font-semibold">{formatRand(d.amount_cents)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className="text-brand underline">← Newer</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className="text-brand underline">Older →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
