import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { EmptyState, MiniStat, PageHeader } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { SupportContact } from "@/components/legal";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { viewerRole } from "@/lib/charity/team";
import { formatDate, formatDateTime, taxYearFor, taxYearName } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { it3dPeriodRange, PERIOD_LABELS, type It3dProblem } from "@/lib/receipts/it3d";
import { prepareIt3d, readChoice } from "@/lib/receipts/it3d-request";
import { it3dTaxYears } from "@/lib/receipts/it3d-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveSarsDetails } from "./actions";
import { FileDownload, SarsDetailsForm, SheetDownload } from "./forms";

export const metadata: Metadata = { title: "SARS submission (IT3(d))" };

/** How many problems the page lists before saying "and more" (the capture sheet marks every one). */
const SHOWN = 100;

/**
 * The charity's IT3(d) submission to SARS (03/11/2026): choose the tax year and period, see what must be fixed and
 * the totals, then download the eFiling capture sheet or the SARS data file. Owner only (the files hold donors' full
 * ID numbers); on the page an ID shows only its last 4 digits.
 */
export default async function SarsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/receipts/sars">) {
  const { id } = await params;
  const sp = await searchParams;
  const k = formKey(sp);
  await requireViewer(`/charity-admin/${id}/receipts/sars`);
  const { charity, priv } = await loadCharityForManager(id);
  const owner = (await viewerRole(id)) === "owner";
  const here = `/charity-admin/${id}/receipts/sars`;
  const back = <Link href={`/charity-admin/${id}/receipts`} className="text-muted hover:text-brand hover:underline">← s18A receipts</Link>;
  const intro = (
    <>
      For up to 50 receipts, type them into the IT3-01 form on eFiling using the capture sheet. For more, your accountant or SARS-registered submitter
      sends the data file over SARS HTTPS. Check the first submission with your accountant.
    </>
  );

  if (!owner) {
    return (
      <div className="space-y-5">
        <PageHeader back={back} title="SARS submission (IT3(d))" intro={intro} />
        <Notice>Only your charity&apos;s owner can see and download the SARS files, because they hold donors&apos; ID numbers. Ask your owner to do it.</Notice>
      </div>
    );
  }

  const now = new Date();
  const years = await it3dTaxYears(id);
  const first = typeof sp.year === "string" ? sp.year : undefined;
  const choice = readChoice(first ?? years[0] ?? taxYearFor(now), typeof sp.period === "string" ? sp.period : "full_year", now)
    ?? { taxYear: years[0] ?? taxYearFor(now), period: "full_year" as const };
  const yearChoices = [...new Set([...years, choice.taxYear, taxYearFor(now), taxYearFor(now) - 1])].filter((y) => y >= 2022).sort((a, b) => b - a);
  const result = await prepareIt3d(id, choice, { now });
  const range = it3dPeriodRange(choice.taxYear, choice.period);
  // The charity's own SARS details (never public). Read with the service role: the page has checked this is the owner.
  const { data: sars } = await createAdminClient().from("charity_private").select("tax_reference_number, legal_form, registration_number").eq("charity_id", id).maybeSingle();
  const blocking = result.problems.filter((p) => p.severity === "blocking");
  const warnings = result.problems.filter((p) => p.severity === "warning");
  const query = `year=${choice.taxYear}&period=${choice.period}`;
  const dates = `${formatDate(`${range.start}T12:00:00+02:00`)} to ${formatDate(`${range.end}T12:00:00+02:00`)}`;
  const periodName = `${choice.period === "first_half" ? "the first six months of the" : "the full"} ${taxYearName(choice.taxYear)} tax year (${dates})`;

  return (
    <div className="space-y-5">
      <PageHeader back={back} title="SARS submission (IT3(d))" intro={intro} />
      <DonePanel charity={charity} sp={sp} here={here} />

      <Card title="Tax year and period">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="year" className="block text-sm font-semibold">Tax year</label>
            <select id="year" name="year" defaultValue={choice.taxYear} className="min-h-11 rounded-control border-2 border-border bg-surface px-3 text-sm">
              {yearChoices.map((y) => <option key={y} value={y}>{taxYearName(y)} (SARS year {y})</option>)}
            </select>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">Period</legend>
            <div className="flex flex-wrap gap-2">
              {(["first_half", "full_year"] as const).map((p) => (
                <label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-border px-4 text-sm font-semibold has-checked:border-brand has-checked:bg-honey-soft has-checked:text-brand">
                  <input type="radio" name="period" value={p} defaultChecked={choice.period === p} />
                  {PERIOD_LABELS[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-control border-2 border-border bg-surface px-4 text-sm font-semibold text-brand hover:border-brand">Check this period</button>
        </form>
        <p className="mt-3 text-sm text-muted">
          Showing {periodName}. First six months is 1 March to 31 August; the full tax year is 1 March to the end of February.
          Checked {formatDateTime(now)}; reload the page to check again.
        </p>
      </Card>

      {result.nil ? (
        <EmptyState title="No s18A receipts in this period">
          If SARS asks for a nil declaration, it is done on eFiling, not with this file. Receipts are issued once a year, after the tax year ends,
          so the first six months of a tax year that hasn&apos;t ended has none yet.
        </EmptyState>
      ) : (
        <Card title="What goes to SARS">
          <p className="mb-3 text-sm text-muted">Match these with your books before you submit.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="s18A receipts" value={result.totals.receipts} />
            <MiniStat label="Donors" value={result.totals.donors} />
            <MiniStat label="Donations" value={result.totals.donations} />
            {/* The full row on a phone: a total like R1 250 000.00 doesn't fit half the width. */}
            <div className="col-span-2 sm:col-span-1">
              <MiniStat label="Total" value={formatRand(result.totals.totalCents)} strong />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Issued s18A receipts only, and only donations paid in this period. Refunded and charged-back donations are left out.</p>
        </Card>
      )}

      {result.problems.length ? (
        <Card title={blocking.length ? `${blocking.length} ${blocking.length === 1 ? "thing" : "things"} to fix before the data file` : "Notes to check"}>
          {blocking.length ? (
            <p className="mb-3 text-sm">The SARS data file downloads once these are fixed. The capture sheet downloads now, with each problem marked on its row.</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {[...blocking, ...warnings].slice(0, SHOWN).map((p, i) => <ProblemRow key={i} p={p} charityId={id} />)}
          </ul>
          {result.problems.length > SHOWN ? <p className="mt-3 text-sm text-muted">And {result.problems.length - SHOWN} more, all marked in the capture sheet.</p> : null}
          <p className="mt-3 text-xs text-muted">Something here you can&apos;t fix yourself? Tell us: <SupportContact />.</p>
        </Card>
      ) : !result.nil ? (
        <Notice tone="success">Nothing to fix. Everything SARS needs is here for this period.</Notice>
      ) : null}

      <Card title="Download">
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="font-semibold text-indigo">For eFiling (up to 50 receipts)</h3>
            <p className="text-sm text-muted">Your charity&apos;s details at the top, then one row per donation in the order the IT3-01 form asks for them, and the totals.</p>
            {result.nil ? <p className="text-sm text-muted">Nothing to download for this period.</p> : <SheetDownload url={`${here}/sheet?${query}`} />}
          </div>
          <div className="space-y-2 border-t-2 border-border pt-5">
            <h3 className="font-semibold text-indigo">For SARS HTTPS (any number of receipts)</h3>
            <p className="text-sm text-muted">
              The data file in SARS&apos;s IT3(d) layout. It needs eFiling enrolment for third-party data and the Source Identifier SARS gives for HTTPS.
              Charities with up to 50 receipts can use the capture sheet instead, without it.
            </p>
            {result.nil ? (
              <p className="text-sm text-muted">No s18A receipts in this period, so there is no file to make.</p>
            ) : (
              <FileDownload key={k} url={`${here}/file`} year={choice.taxYear} period={choice.period} ready={result.fileReady}
                notReady={result.fileReady ? null : "Fix the things listed above first. Nothing is sent until you download the file and your submitter sends it."} />
            )}
          </div>
          <p className="text-xs text-muted">Both files hold donors&apos; full ID numbers. Keep them safe, share them only with your accountant or submitter, and delete them once submitted.</p>
        </div>
      </Card>

      <section id="sars-details" className="scroll-mt-4">
        <Card title="Your charity's SARS details">
          <p className="mb-3 text-sm text-muted">
            Your charity submits its own IT3(d), so SARS needs these about your charity. Your contact person ({priv?.contact_name ?? "not set"}) and their phone and email go in too:
            change them in <Link href={`/charity-admin/${id}/application?step=contact`} className="text-brand underline">your contact details</Link>.
          </p>
          <SarsDetailsForm key={k} action={saveSarsDetails.bind(null, id, choice.taxYear, choice.period)}
            values={{ tax: (sars?.tax_reference_number as string | null) ?? null, form: (sars?.legal_form as string | null) ?? null, reg: (sars?.registration_number as string | null) ?? null }} />
        </Card>
      </section>
    </div>
  );
}

function ProblemRow({ p, charityId }: { p: It3dProblem; charityId: string }) {
  const tone = p.severity === "blocking" ? "border-danger bg-danger-soft" : "border-warning bg-warning-soft";
  const who = [p.receiptNumber ? `Receipt ${p.receiptNumber}` : null, p.donorName ?? null, p.idLast4 ? `number ending ${p.idLast4}` : null].filter(Boolean).join(" · ");
  const link =
    p.fix === "sars_details" ? <a href="#sars-details" className="text-brand underline">Fix it below</a>
    : p.fix === "contact" ? <Link href={`/charity-admin/${charityId}/application?step=contact`} className="text-brand underline">Change your contact details</Link>
    : null;
  return (
    <li className={`rounded-control border-l-4 p-3 ${tone}`}>
      <p className="font-semibold text-navy">{p.severity === "blocking" ? "Fix first: " : "Check: "}<span className="font-normal">{p.message}</span></p>
      {who ? <p className="mt-1 text-xs text-muted [overflow-wrap:anywhere]" dir="auto">{who}</p> : null}
      {link ? <p className="mt-1">{link}</p> : null}
    </li>
  );
}
