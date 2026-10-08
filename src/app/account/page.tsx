import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { BilingualName } from "@/components/bilingual-name";
import { requireViewer } from "@/lib/auth";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const viewer = await requireViewer();
  const { denied } = await searchParams;

  // Only the receipts that belong to this person as a donor (not every receipt
  // of a charity they manage).
  const supabase = await createClient();
  const { data: myDonors } = await supabase.from("donors").select("id").eq("user_id", viewer.userId);
  const donorIds = (myDonors ?? []).map((d) => d.id as string);
  const { data: receipts } = donorIds.length
    ? await supabase
        .from("s18a_receipts")
        .select("id, tax_year, amount_cents, issued_at, status, pdf_path, reference:details->>receipt_reference, charity_name:details->charity->>legal_name_en")
        .in("donor_id", donorIds)
        .order("issued_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-4">
      {denied ? (
        <p className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          You don&apos;t have access to that page.
        </p>
      ) : null}
      <section className="rounded-card bg-surface border border-border p-5">
        <h1 className="text-xl font-semibold">Your account</h1>
        <p className="mt-1 break-all text-sm text-muted">{viewer.email}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>Donor</Badge>
          {viewer.managedCharityIds.length > 0 ? <Badge tone="brand">Charity admin</Badge> : null}
          {viewer.isPlatformAdmin ? <Badge tone="success">Platform admin</Badge> : null}
        </div>
      </section>

      <section className="rounded-card bg-surface border border-border p-5 space-y-3">
        <h2 className="font-semibold">Your s18A receipts</h2>
        {receipts && receipts.length > 0 ? (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className="rounded-control border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.reference}</p>
                    <p className="text-muted">{r.charity_name}</p>
                    <p className="text-muted">{taxYearLabel(r.tax_year)}</p>
                    <p className="text-muted">Issued {formatDate(r.issued_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatRand(r.amount_cents)}</p>
                    {r.status === "void" ? (
                      <Badge tone="warning">Withdrawn</Badge>
                    ) : r.pdf_path ? (
                      <Link href={`/receipts/${r.id}`} className="text-brand underline">Download PDF</Link>
                    ) : (
                      <span className="text-muted">PDF on its way</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Your s18A receipts appear here once a tax year closes, one for each charity you gave to with a receipt.
            Sign in with the same email address you gave with.
          </p>
        )}
      </section>

      {viewer.managedCharityIds.length > 0 || viewer.isPlatformAdmin ? (
        <section className="rounded-card bg-surface border border-border p-5 space-y-3">
          <h2 className="font-semibold">Manage</h2>
          {viewer.charities.map((c) => (
            <Link key={c.id} href="/charity-admin" className="block rounded-control border border-border p-3">
              <BilingualName en={c.name_en} he={c.name_he} />
            </Link>
          ))}
          {viewer.managedCharityIds.length > 0 && viewer.charities.length === 0 ? (
            <Link href="/charity-admin" className="block rounded-control border border-border p-3">
              Your charities (you&apos;ll be asked for your authenticator code)
            </Link>
          ) : null}
          {viewer.isPlatformAdmin ? (
            <Link href="/admin" className="block rounded-control border border-border p-3">
              Platform admin
            </Link>
          ) : null}
        </section>
      ) : null}

      <form action="/auth/signout" method="post">
        <button className="text-sm text-muted underline">Sign out</button>
      </form>
    </div>
  );
}
