import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { requirePlatformAdmin } from "@/lib/auth";
import { containsPattern, safeSearch } from "@/lib/charity/dashboard";
import { formatDate, formatDateTime, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { receiptsEnabled } from "@/config/receipts";
import { getRun, listUnfinishedRuns, listWaitingRuns, pendingAtYearEnd, runNeedsFinishing, STUCK_MINUTES } from "@/lib/receipts/runs";
import { finishReceipts, markReceiptsStopped, sendBackReceipts, signOffReceipts, voidReceipt } from "./actions";
import { FinishForm, MarkStoppedForm, SendBackForm, SignOffForm, VoidForm } from "./forms";
import { yearsWithReceipts } from "@/lib/receipts/year-list-store";
import { Card } from "@/components/card";

export const metadata: Metadata = { title: "Receipts" };

const tabs = ["issued", "void"] as const;

export default async function AdminReceiptsPage({ searchParams }: PageProps<"/admin/receipts">) {
  await requirePlatformAdmin();
  const { status: raw, q: rawQ, run: rawRun } = await searchParams;
  const justRan = typeof rawRun === "string" ? await getRun(rawRun) : null;
  const status = tabs.includes(raw as (typeof tabs)[number]) ? (raw as (typeof tabs)[number]) : "issued";
  // Search by receipt number, donor or charity name: letters, digits, spaces and dashes only (it goes into a filter).
  const q = typeof rawQ === "string" ? safeSearch(rawQ) : "";

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
      `details->>receipt_reference.ilike.${containsPattern(q)},details->donor->>name.ilike.${containsPattern(q)},details->charity->>legal_name_en.ilike.${containsPattern(q)}`,
    );
  }
  const { data: receipts, error } = await query;
  if (error) throw error;
  const [waiting, unfinished, years] = await Promise.all([listWaitingRuns(), listUnfinishedRuns(), yearsWithReceipts()]);
  const pending = await Promise.all(waiting.map((w) => pendingAtYearEnd(w.charity_id, w.tax_year)));
  const enabled = receiptsEnabled();

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-muted">← Platform admin</Link>
      <h1 className="text-xl font-semibold">s18A receipts</h1>

      {justRan?.summary ? <RunDone run={justRan} /> : null}
      {justRan?.status === "cancelled" ? (
        <section role="status" aria-label="What just happened" className="space-y-1 rounded-card border border-border bg-warning-soft p-4 text-sm">
          <p className="font-medium text-navy">{justRan.charity_name}, {taxYearLabel(justRan.tax_year)}: nothing was issued.</p>
          <p>It went back to the charity&apos;s receipts page with the new list and this note: &ldquo;{justRan.cancelled_reason}&rdquo;</p>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="waiting-runs">
        <h2 id="waiting-runs" className="font-semibold">Waiting for your sign-off</h2>
        {!enabled ? (
          <p className="rounded-card bg-warning-soft p-3 text-sm text-warning">
            Receipts are switched off until the attorney confirms the wording (RECEIPTS_ENABLED and RECEIPT_WORDING_CONFIRMED). Charities can approve their lists; signing off is refused until then.
          </p>
        ) : null}
        {waiting.length === 0 ? <p className="text-sm text-muted">No charity has a list waiting. A charity approves its list after the tax year closes.</p> : null}
        {waiting.map((w, i) => (
          <div key={w.id} className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
            <p className="font-medium">{w.charity_name}</p>
            <p>
              {taxYearLabel(w.tax_year)}: {w.receipts_planned} {w.receipts_planned === 1 ? "receipt" : "receipts"}, {formatRand(w.total_cents)}. Approved by the charity on {formatDate(w.charity_approved_at)}.
            </p>
            {pending[i] ? <p className="text-warning">{pending[i]} s18A {pending[i] === 1 ? "payment" : "payments"} from the last days of the year still pending. Check Payments first.</p> : null}
            {w.status === "issuing" ? (
              <div className="space-y-2">
                <p className="text-muted">Being issued since {w.signed_off_at ? formatDateTime(w.signed_off_at) : "just now"}.</p>
                {w.stuck ? (
                  <>
                    <p className="text-warning">This has taken more than {STUCK_MINUTES} minutes, so it most likely stopped part way.</p>
                    <MarkStoppedForm action={markReceiptsStopped.bind(null, w.id)} />
                  </>
                ) : null}
              </div>
            ) : (
              <>
                <SignOffForm action={signOffReceipts.bind(null, w.id)} count={w.receipts_planned} total={formatRand(w.total_cents)} />
                <details>
                  <summary className="cursor-pointer text-brand">Send it back to the charity</summary>
                  <div className="mt-2"><SendBackForm action={sendBackReceipts.bind(null, w.id, w.total_cents)} /></div>
                </details>
              </>
            )}
          </div>
        ))}
        {unfinished.map((u) => (
          <div key={u.id} className="space-y-2 rounded-card border border-border bg-warning-soft p-4 text-sm">
            <p className="font-medium">{u.charity_name}, {taxYearLabel(u.tax_year)}: not finished</p>
            <p>
              {u.summary?.issued ?? 0} issued, {u.summary?.pdfsMade ?? 0} PDFs made, {u.summary?.emailed ?? 0} emailed.
              {u.summary?.failed[0] ? ` Some steps failed (${u.summary.failed[0].message}).` : " Not every receipt has been emailed yet."} Finish makes what is missing and sends what wasn&apos;t sent. It never issues a new receipt.
            </p>
            <FinishForm action={finishReceipts.bind(null, u.id)} />
          </div>
        ))}
      </section>
      {years.length ? (
        <Card title="Yearly lists for SARS (draft)">
          <p className="mb-2 text-sm text-muted">
            Every issued receipt for a charity&apos;s tax year, with the last 4 digits of each ID and tax number and anything SARS will want that is missing.
            A list to check before the IT3(d) submission, not the SARS file itself: that layout comes from SARS and isn&apos;t built yet.
          </p>
          <ul className="divide-y divide-border text-sm">
            {years.map((y) => (
              <li key={`${y.charityId}-${y.taxYear}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">{y.charityName}, tax year {y.taxYear} <span className="text-muted">({y.count} {y.count === 1 ? "receipt" : "receipts"})</span></span>
                <span className="space-x-3">
                  <a href={`/admin/receipts/year-list?charity=${y.charityId}&year=${y.taxYear}`} className="text-brand underline">CSV</a>
                  <a href={`/admin/receipts/year-list?charity=${y.charityId}&year=${y.taxYear}&format=xlsx`} className="text-brand underline">Excel</a>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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
        <button type="submit" className="shrink-0 whitespace-nowrap rounded-control bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast">Search</button>
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

/** What a sign-off or a finish just did, from the run's own record. */
function RunDone({ run }: { run: NonNullable<Awaited<ReturnType<typeof getRun>>> }) {
  const s = run.summary!;
  const unfinished = runNeedsFinishing(s);
  return (
    <section role="status" aria-label="What just happened" className={`space-y-1 rounded-card border border-border p-4 text-sm ${unfinished ? "bg-warning-soft" : "bg-brand-soft"}`}>
      <p className="font-medium text-navy">
        {run.charity_name}, {taxYearLabel(run.tax_year)}: {s.issued} of {s.planned} {s.planned === 1 ? "receipt" : "receipts"} issued, {s.pdfsMade} PDFs made, {s.emailed} emailed.
      </p>
      {unfinished ? (
        <p>
          Not everything is done yet{s.emailed < s.issued && s.failed.length === 0 && s.emailFailed === 0 ? ": receipts are not emailed while email is not switched on (EMAIL_TRANSPORT) or SITE_URL is missing" : ""}.
          It is listed below under &ldquo;not finished&rdquo;. Finish makes what is missing and sends what wasn&apos;t sent; it never issues a new receipt.
        </p>
      ) : (
        <p>All done. Each donor has their receipt by email, and the charity sees them on its receipts page.</p>
      )}
    </section>
  );
}
