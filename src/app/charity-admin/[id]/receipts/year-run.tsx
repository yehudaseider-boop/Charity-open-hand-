import { Card, Notice } from "@/components/card";
import { SupportContact } from "@/components/legal";
import { formatDate, taxYearLabel } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { missingWords, type MissingDetail } from "@/lib/donations/s18a-details";
import { andList, charityMissingWords } from "@/lib/receipts/details";
import { CHARITY_LEFT_OUT_WORDS } from "@/lib/receipts/left-out";
import type { Plan, ReceiptRun } from "@/lib/receipts/runs";
import { approveReceipts, withdrawReceipts } from "./actions";
import { ApproveReceiptsForm, WithdrawReceiptsForm } from "./forms";
import { CertificateList } from "./certificate-list";

/*
 * The yearly run's card on the s18A receipts page, one per closed tax year (page.tsx loads the data and checks who
 * may see it; this only shows it).
 */

/** One closed tax year: its list of receipts to approve, or where the approval stands. */
export function YearRun({ charityId, taxYear, open, latest, plan, pending, canCheck }: { charityId: string; taxYear: number; open: ReceiptRun | null; latest: ReceiptRun | null; plan: Plan | null; pending: number; canCheck: boolean }) {
  if (open) {
    return (
      <Card title={`${taxYearLabel(taxYear)}: approved`}>
        <div className="space-y-3 text-sm">
          {open.status === "issuing" ? (
            <p>Givezy has signed it off and the receipts are being issued now. Each donor gets theirs by email.</p>
          ) : (
            <p>
              You approved {open.receipts_planned} {open.receipts_planned === 1 ? "receipt" : "receipts"}, {formatRand(open.total_cents)} in all, on {formatDate(open.charity_approved_at)}.
              It&apos;s waiting for Givezy to check it and sign it off. Nothing has been issued yet.
            </p>
          )}
          {open.status === "charity_approved" ? <WithdrawReceiptsForm action={withdrawReceipts.bind(null, charityId, open.id)} /> : null}
        </div>
      </Card>
    );
  }
  if (!plan || plan.toIssue === 0) {
    const held = plan && (plan.detailsMissing.length || plan.leftOut.length) ? (
      <div className="space-y-3">
        {plan.detailsMissing.length ? <DetailsMissing lines={plan.detailsMissing} /> : null}
        {plan.leftOut.length ? <LeftOut groups={plan.leftOut} /> : null}
      </div>
    ) : null;
    // Only declined receipts left (or none at all): nothing to approve, but each declined one can be reopened.
    const declined = plan?.lines.length ? <CertificateList charityId={charityId} taxYear={taxYear} lines={plan.lines} canOpen={canCheck} /> : null;
    const declinedNote = declined ? (
      <div className="space-y-2 text-sm">
        <p>{plan!.lines.length === 1 ? "This receipt is" : "These receipts are"} declined, so there&apos;s nothing to send to Givezy. Open one to reopen it.</p>
        {declined}
      </div>
    ) : null;
    if (latest?.status !== "done") {
      if (!held && !declinedNote) return null;
      return (
        <div id={`year-${taxYear}`} className="scroll-mt-4">
          <Card title={`${taxYearLabel(taxYear)}: ${declinedNote ? "declined" : plan?.detailsMissing.length ? "waiting for donors" : "not on a receipt yet"}`}>
            <div className="space-y-3">{declinedNote}{held}</div>
          </Card>
        </div>
      );
    }
    const s = latest.summary;
    return (
      <div id={`year-${taxYear}`} className="scroll-mt-4">
        <Card title={`${taxYearLabel(taxYear)}: issued`}>
          <p className="text-sm">
            {s ? `${s.issued} ${s.issued === 1 ? "receipt" : "receipts"} issued` : "Receipts issued"} on {formatDate(latest.signed_off_at ?? latest.finished_at ?? latest.charity_approved_at)}
            {s ? `, ${s.emailed} emailed to donors so far.` : "."} You can see each one in the list below.
          </p>
          {declinedNote ? <div className="mt-3">{declinedNote}</div> : null}
          {held ? <div className="mt-3">{held}</div> : null}
        </Card>
      </div>
    );
  }
  // Sent back by Givezy (not withdrawn by the charity itself): say why.
  const sentBack = latest?.status === "cancelled" && latest.cancelled_reason && latest.cancelled_reason !== "The charity took back its approval." ? latest.cancelled_reason : null;
  const total = formatRand(plan.totalCents);
  const c = plan.counts;
  // SARS needs the charity's own address and reference number on every receipt: without them every receipt would be
  // refused at sign-off, so nothing can be approved (review 21/11/2026). The list stays, so each receipt can still be
  // opened, declined or reopened meanwhile; only the approve buttons are off, with the reason.
  const blocked = plan.charityMissing.length > 0;
  return (
    <div id={`year-${taxYear}`} className="scroll-mt-4">
      <Card title={`${taxYearLabel(taxYear)}: ${blocked ? "can't be approved yet" : "ready to approve"}`}>
        <div className="space-y-3 text-sm">
          {sentBack ? <Notice tone="warning">Your earlier approval came back from Givezy. {sentBack}</Notice> : null}
          {blocked ? <CharityMissingNotice missing={plan.charityMissing} toIssue={plan.toIssue} total={total} /> : null}
          <p>
            The tax year has ended. These donors asked for an s18A receipt. Open each one to see its preview, then approve it, correct the
            donor&apos;s name or address, or decline it. Or check the names and amounts here and approve them all. Givezy signs the list off
            after you, and then each donor gets their receipt by email.
          </p>
          <p className="font-medium text-indigo" role="status">
            {c.to_check} to check · {c.approved + c.edited} approved{c.edited ? ` (${c.edited} edited)` : ""} · {c.declined} declined
          </p>
          {pending > 0 ? (
            <Notice tone="warning">
              {pending} s18A {pending === 1 ? "payment" : "payments"} from the last days of the tax year {pending === 1 ? "is" : "are"} still waiting for the payment provider.
              If {pending === 1 ? "it goes" : "they go"} through after you approve, that donor&apos;s receipt has to be withdrawn and issued again, so you may want to wait a day or two.
            </Notice>
          ) : null}
          <CertificateList charityId={charityId} taxYear={taxYear} lines={plan.lines} total={total} toIssue={plan.toIssue} canOpen={canCheck} />
          <p className="text-xs text-muted">
            Amounts are the donations only, never a contribution to Givezy, and come only from recorded donations: they can&apos;t be typed over.
            Someone missing, or an amount wrong? Record or correct the gift on Donations, or tell us (<SupportContact />).
          </p>
          {plan.detailsMissing.length ? <DetailsMissing lines={plan.detailsMissing} /> : null}
          {plan.leftOut.length ? <LeftOut groups={plan.leftOut} /> : null}
          {blocked ? (
            <p className="rounded-control bg-warning-soft p-3 font-medium text-warning">
              Approve all is off until your charity&apos;s {andList(plan.charityMissing.map((m) => m.replace(/^the charity's /, "")))} {plan.charityMissing.length === 1 ? "is" : "are"} on your record (see above).
            </p>
          ) : (
            <ApproveReceiptsForm action={approveReceipts.bind(null, charityId, taxYear, plan.fingerprint)} count={plan.toIssue} total={total} toCheck={c.to_check} declined={c.declined} />
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * The charity's record lacks what SARS needs on every receipt (missingForCharity): what is missing, and what to do.
 * On the year's card and on each receipt's own page, so approving is off with the same reason everywhere.
 */
export function CharityMissingNotice({ missing, toIssue, total }: { missing: string[]; toIssue?: number; total?: string }) {
  const n = missing.length;
  return (
    <Notice tone="warning">
      <span className="block font-semibold">{charityMissingWords(missing)}</span>
      <span className="mt-1 block">
        What to do: send your charity&apos;s {andList(missing.map((m) => m.replace(/^the charity's /, "")))} to us (<SupportContact />). Your
        application details can&apos;t be changed on the dashboard once you&apos;re approved, so we add {n === 1 ? "it" : "them"} for you.{" "}
        {toIssue !== undefined && total ? (
          <>
            Your list of {toIssue} s18A {toIssue === 1 ? "receipt" : "receipts"} ({total}) is kept and is ready to approve here once {n === 1 ? "it's" : "they're"} added.
            Meanwhile you can still open each receipt, and decline or reopen one.
          </>
        ) : (
          <>Your decisions so far are kept. Meanwhile you can still decline this receipt, or reopen it.</>
        )}
      </span>
    </Notice>
  );
}

/**
 * Paid s18A gifts left off a receipt for now for another reason (21/11/2026): on hold while a refund or dispute is
 * checked, paid after the donor's receipt was issued, or paid before the mandate was signed. Counted and grouped, with
 * what happens next, so no donor looks forgotten. Names, dates and amounts only: never an email, phone or address.
 */
function LeftOut({ groups }: { groups: Plan["leftOut"] }) {
  const gifts = groups.reduce((t, g) => t + g.lines.length, 0);
  return (
    <div className="space-y-3 rounded-control bg-honey-soft p-3 text-sm">
      <p className="font-semibold text-navy">
        Not on a receipt yet: {gifts} more {gifts === 1 ? "gift" : "gifts"}
      </p>
      {groups.map((g) => {
        const w = CHARITY_LEFT_OUT_WORDS[g.reason];
        return (
          <section key={g.reason} aria-label={w.what} className="space-y-1">
            <p className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-medium text-navy">
                {w.what}: {g.lines.length} {g.lines.length === 1 ? "gift" : "gifts"}
              </span>
              <span className="shrink-0 tabular-nums">{formatRand(g.amountCents)}</span>
            </p>
            <p className="text-muted">{w.next}</p>
            <ul className="divide-y divide-border">
              {g.lines.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium" dir="auto">{l.donorName}</span>
                    {l.paidAt ? <span className="text-muted">Paid {formatDate(l.paidAt)}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatRand(l.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted">Questions about one of these? Tell us (<SupportContact />).</p>
    </div>
  );
}

/**
 * Gifts held back from the list: the donor asked for an s18A receipt and chose to add their details after paying,
 * and hasn't yet. Never receipted without the required particulars (decided 04/11/2026).
 */
function DetailsMissing({ lines }: { lines: Plan["detailsMissing"] }) {
  const open = lines.filter((l) => l.canAddOnGivezy).length;
  const late = lines.length - open;
  return (
    <div className="space-y-2 rounded-control bg-warning-soft p-3 text-sm">
      <p className="font-semibold text-warning">
        Details missing: {lines.length} {lines.length === 1 ? "gift is" : "gifts are"} not on this list yet
      </p>
      <p className="text-navy">
        {lines.length === 1 ? "This donor" : "These donors"} asked for an s18A receipt but {lines.length === 1 ? "hasn't" : "haven't"} added the details SARS needs.
        {open ? " Where it says so, the donor can still add them from their Givezy account. Once they do, the gift joins the list. If that donor's receipt was issued already, Givezy withdraws it and issues it again with the gift." : null}
        {late ? " Where it says too late, the donor can no longer add them on Givezy." : null}
      </p>
      <ul className="divide-y divide-border">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium" dir="auto">{l.donorName}</span>
              <span className="text-muted">
                {l.paidAt ? formatDate(l.paidAt) : null}
                {l.missing.length ? ` · Missing: ${missingWords(l.missing as MissingDetail[], "their").replace(/^their /, "")}` : null}
              </span>
              <span className={l.canAddOnGivezy ? "text-muted" : "font-medium text-navy"}>
                {l.canAddOnGivezy ? "The donor can still add them on Givezy." : "Too late to add on Givezy: the donor can ask you for a receipt directly."}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatRand(l.amountCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
