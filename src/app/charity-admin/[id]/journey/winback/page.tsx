import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Card, Notice } from "@/components/card";
import { PageHeader, secondaryAction } from "@/components/dash";
import { ActionForm } from "@/components/forms/action-form";
import { requireViewer } from "@/lib/auth";
import { WINBACK_PRESS_CAP, chosenDonors, existingSkippedSentence, firstDue } from "@/lib/charity/journey";
import { journeysV2, planWinbackDonors } from "@/lib/charity/journey-store";
import { keepingDetails, keepingListKey, keepingListRows, keepingWindow, keepingYearKey } from "@/lib/charity/keeping-donors";
import { loadKeepingDonors } from "@/lib/charity/keeping-donors-queries";
import { lapsedDetails, lapsedPeriod, lapsedPeriodKey } from "@/lib/charity/lapsed-monthly";
import { loadLapsedMonthly } from "@/lib/charity/lapsed-monthly-queries";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner } from "@/lib/charity/team";
import { formatDate } from "@/lib/dates";
import { plural } from "@/lib/text";
import { addWinback } from "../actions";

export const metadata: Metadata = { title: "Add to win-back journey" };

/**
 * "Add to win-back journey" (CRM step 7, 10/11/2026), asked first: the donors chosen on the stopped monthly donors list
 * or a keeping-donors list ("gave last year, not since", "gave in an earlier year, not since"), how many join, and who
 * is left out and why. Owner only. At most WINBACK_PRESS_CAP at a time.
 */
export default async function WinbackPage({ params, searchParams }: PageProps<"/charity-admin/[id]/journey/winback">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/journey/winback`);
  const { charity } = await loadCharityForManager(id);
  const base = `/charity-admin/${id}`;
  const from = sp.list === "stopped" ? "stopped" : sp.list === "lybunt" || sp.list === "sybunt" ? "keeping" : "chosen";
  const back =
    from === "stopped"
      ? { href: `${base}/monthly/stopped${typeof sp.period === "string" ? `?period=${encodeURIComponent(sp.period)}` : ""}`, label: "← Monthly donors who stopped" }
      : { href: `${base}/keeping${typeof sp.list === "string" ? `?list=${encodeURIComponent(sp.list)}` : ""}`, label: "← Keeping donors" };

  const shell = (body: React.ReactNode) => (
    <div className="space-y-5">
      <PageHeader back={<BackLink href={back.href}>{back.label}</BackLink>} title="Add to win-back journey" intro="Donors you add get the emails of your win-back journey, from email 1. Anyone who gives again leaves it." />
      {body}
    </div>
  );

  if (!(await isOwner(id))) return shell(<Notice>Only your charity&apos;s owner can add donors to the win-back journey. Nothing was changed.</Notice>);
  if (charity.status !== "approved") return shell(<Notice tone="warning">You can add donors once your page is live. Nothing was changed.</Notice>);
  if (!(await journeysV2())) return shell(<Notice>The win-back journey isn&apos;t switched on for your charity yet. Nothing was changed.</Notice>);

  // The donors: those ticked on the list, or everyone on it with a page (up to the cap), worked out again here.
  let raw: string[] = [];
  let readFailed = false;
  try {
    if (from === "stopped" && sp.all === "1") {
      const rows = await loadLapsedMonthly(id, lapsedPeriod(lapsedPeriodKey(sp.period), new Date()));
      raw = rows.map((r) => lapsedDetails(r).donorId).filter((x): x is string => Boolean(x));
    } else if (from === "keeping" && sp.all === "1") {
      const rows = await loadKeepingDonors(id, keepingWindow(keepingYearKey(sp.year), new Date()));
      raw = keepingListRows(rows, keepingListKey(sp.list)).map((r) => keepingDetails(r).donorId).filter((x): x is string => Boolean(x));
    } else {
      raw = ([] as unknown[]).concat(sp.d ?? []).map(String);
    }
  } catch {
    readFailed = true;
  }
  if (readFailed) {
    return shell(
      <section role="alert" className="space-y-3 rounded-card border-2 border-border bg-surface p-5">
        <h2 className="font-display text-xl font-bold text-indigo">We couldn&apos;t load that list</h2>
        <p className="text-sm text-navy">Nothing was changed. It&apos;s usually a dropped connection: go back and try again in a moment.</p>
        <Link href={back.href} className={secondaryAction}>Back to the list</Link>
      </section>,
    );
  }
  const { ids, over } = chosenDonors(raw);
  if (!ids.length) {
    return shell(
      <Card title="Nobody chosen">
        <p className="text-sm text-muted">Tick the donors you&apos;d like to win back on the list, or choose &quot;Add everyone on this list&quot;. Donors whose details were erased can&apos;t be chosen.</p>
        <p className="mt-3"><Link href={back.href} className={secondaryAction}>Back to the list</Link></p>
      </Card>,
    );
  }

  const { journey, plan } = await planWinbackDonors(id, ids);
  if (!journey.enabled || !journey.steps.length) {
    return shell(
      <Card title="Switch your win-back journey on first">
        <p className="text-sm text-muted">Write its emails and switch it on, then come back to this list. Nothing was changed.</p>
        <p className="mt-3"><Link href={`${base}/journey?j=winback`} className={secondaryAction}>Go to your win-back journey</Link></p>
      </Card>,
    );
  }
  const notMine = ids.length - plan.add.length - Object.values(plan.skipped).reduce((a, b) => a + b, 0);
  const firstEmail = formatDate(firstDue(new Date(), journey.steps).toISOString());

  return shell(
    <Card title={plan.add.length ? `Add ${plural(plan.add.length, "donor")}?` : "Nobody to add"}>
      <div className="space-y-3 text-sm">
        {over ? <p className="text-muted">You chose more than {WINBACK_PRESS_CAP}: the first {WINBACK_PRESS_CAP} are here. Add the rest afterwards.</p> : null}
        {plan.add.length ? (
          <p>
            {plural(plan.add.length, "donor")} will get your win-back emails, starting {firstEmail} at the earliest, never more than one message from you a week.{" "}
            {existingSkippedSentence(plan.skipped)}
            {notMine > 0 ? ` ${plural(notMine, "donor")} chosen ${notMine === 1 ? "isn't" : "aren't"} one of your donors and ${notMine === 1 ? "is" : "are"} left out.` : ""}
          </p>
        ) : (
          <p className="text-muted">
            {existingSkippedSentence(plan.skipped) || "None of the donors chosen can be added."} Nothing was changed.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {plan.add.length ? (
            <ActionForm
              action={addWinback.bind(null, id, plan.add.map((c) => c.donorId))}
              submitLabel={`Add ${plural(plan.add.length, "donor")}`}
              pendingLabel="Adding…"
              confirm={`Add ${plural(plan.add.length, "donor")} to your win-back journey? You can take this back for 30 minutes, and only for those who haven't had an email yet.`}
              confirmLabel="Yes, add them"
            />
          ) : null}
          <Link href={back.href} className={secondaryAction}>Back to the list</Link>
        </div>
      </div>
    </Card>,
  );
}
