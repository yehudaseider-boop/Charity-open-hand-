import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { voidReceipt } from "./actions";
import { VoidForm } from "./forms";

export const metadata: Metadata = { title: "Receipts" };

const tabs = ["issued", "void"] as const;

export default async function AdminReceiptsPage({ searchParams }: PageProps<"/admin/receipts">) {
  await requirePlatformAdmin();
  const { status: raw, q: rawQ } = await searchParams;
  const status = tabs.includes(raw as (typeof tabs)[number]) ? (raw as (typeof tabs)[number]) : "issued";
  // Search by receipt number, donor or charity name: letters, digits, spaces and dashes only (it goes into a filter).
  const q = typeof rawQ === "string" ? rawQ.replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 60) : "";

  const supabase = await createClient();
  let query = supabase
    .from("s18a_receipts")
    .select(
      "id, tax_year, amount_cents, issued_at, voided_at, void_reason, pdf_path, emailed_at, reference:details->>receipt_reference, charity_name:details->charity->>legal_name_en, donor_name:details->donor->>name",
    )
    .eq("status", status)
    .order("issued_at", { ascending: false })
    .limit(100);
  if (q) {
    query = query.or(
      `details->>receipt_reference.ilike.*${q}*,details->donor->>name.ilike.*${q}*,details->charity->>legal_name_en.ilike.*${q}*`,
    );
  }
  const { data: receipts, error } = await query;
  if (error) throw error;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-muted">← Platform admin</Link>
      <h1 className="text-xl font-semibold">s18A receipts</h1>
      <nav className="flex gap-2 text-sm">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/admin/receipts?status=${t}`}
            className={`rounded-full border px-3 py-1.5 ${t === status ? "border-brand bg-brand-soft text-indigo" : "border-border"}`}
          >
            {t === "issued" ? "Issued" : "Withdrawn"}
          </Link>
        ))}
      </nav>
      <form className="flex gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Receipt number, donor or charity"
          aria-label="Search receipts"
          className="w-full rounded-control border border-border bg-surface px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast">Search</button>
      </form>
      <p className="text-xs text-muted">{q ? `Matches for \u201c${q}\u201d (up to 100).` : "The latest 100. Search to find an older receipt."}</p>
      {receipts && receipts.length > 0 ? (
        <ul className="space-y-3">
          {receipts.map((r) => (
            <li key={r.id} className="rounded-card border border-border bg-surface p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{r.reference}</p>
                  <p>{r.charity_name}</p>
                  <p className="text-muted">Donor: {r.donor_name}</p>
                  <p className="text-muted">{taxYearLabel(r.tax_year)}</p>
                  <p className="text-muted">Issued {formatDate(r.issued_at)}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="font-medium">{formatRand(r.amount_cents)}</p>
                  {status === "issued" ? (
                    <>
                      <div>{r.pdf_path ? <Link href={`/receipts/${r.id}`} prefetch={false} className="text-brand underline">PDF</Link> : <Badge tone="warning">No PDF yet</Badge>}</div>
                      <div>{r.emailed_at ? <Badge tone="success">Emailed {formatDate(r.emailed_at)}</Badge> : <Badge>Not emailed</Badge>}</div>
                    </>
                  ) : null}
                </div>
              </div>
              {status === "void" ? (
                <p className="mt-2 text-muted">Withdrawn {r.voided_at ? formatDate(r.voided_at) : ""}: {r.void_reason}</p>
              ) : (
                <details className="mt-3">
                  <summary className="cursor-pointer text-danger">Withdraw this receipt</summary>
                  <div className="mt-2"><VoidForm action={voidReceipt.bind(null, r.id)} /></div>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{status === "issued" ? "No receipts have been issued yet." : "No receipts have been withdrawn."}</p>
      )}
    </div>
  );
}
