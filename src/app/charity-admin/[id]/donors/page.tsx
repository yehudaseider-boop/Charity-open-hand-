import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { requireViewer } from "@/lib/auth";
import { safeSearch } from "@/lib/charity/dashboard";
import { loadDonors } from "@/lib/charity/dashboard-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";

export const metadata: Metadata = { title: "Donors" };

const PAGE = 25;

export default async function DonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/donors">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donors`);
  await loadCharityForManager(id);
  const sp = await searchParams;
  const q = safeSearch(typeof sp.q === "string" ? sp.q : "");
  const page = Math.max(1, Math.min(10_000, Number(typeof sp.page === "string" ? sp.page : 1) || 1));

  const all = await loadDonors(id);
  const needle = q.toLowerCase();
  const donors = needle ? all.filter((d) => d.display_name.toLowerCase().includes(needle) || d.email.toLowerCase().includes(needle)) : all;
  const pages = Math.max(1, Math.ceil(donors.length / PAGE));
  const shown = donors.slice((page - 1) * PAGE, page * PAGE);
  const base = `/charity-admin/${id}/donors`;
  const href = (p: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">Donors</h1>
        <a href={`/charity-admin/${id}/export/donors`} className="text-sm text-brand underline">Download CSV</a>
      </div>
      <p className="text-sm text-muted">
        People who have given to your charity. Anonymous donors are anonymous on public pages only: you see their details because you need them to record gifts and issue s18A receipts.
      </p>

      <form action={base} className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          aria-label="Search by donor name or email"
          className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2.5"
        />
        <button className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast">Search</button>
      </form>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{q ? "No donors match." : "No donors yet. People appear here once their first donation is paid."}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.donor_id} className="rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.display_name}</p>
                  <p className="break-all text-muted">{d.email}</p>
                  {d.phone ? <p className="text-muted">{d.phone}</p> : null}
                  <p className="mt-1 text-muted">
                    {d.donation_count} {d.donation_count === 1 ? "donation" : "donations"}, last on {formatDate(d.last_paid_at)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.donor_type !== "individual" ? <Badge>{d.donor_type === "company" ? "Company" : "Trust"}</Badge> : null}
                    {d.wants_18a ? <Badge tone="brand">18A requested</Badge> : null}
                    {d.is_anonymous ? <Badge>Anonymous publicly</Badge> : null}
                  </div>
                </div>
                <p className="shrink-0 font-semibold">{formatRand(d.total_cents)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href(page - 1)} className="text-brand underline">← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="text-brand underline">Next →</Link> : <span />}
        </div>
      ) : null}
    </div>
  );
}
