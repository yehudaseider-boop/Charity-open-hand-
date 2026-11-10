import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Card, Notice } from "@/components/card";
import { PageHeader, secondaryAction } from "@/components/dash";
import { ActionForm } from "@/components/forms/action-form";
import { requireViewer } from "@/lib/auth";
import { WINBACK_PRESS_CAP, WINBACK_SCREEN_CAP, chosenDonors, existingSkippedSentence, firstDue } from "@/lib/charity/journey";
import { journeysV2, planWinbackDonors } from "@/lib/charity/journey-store";
import { winbackListDonors, winbackSource } from "@/lib/charity/winback-lists";
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
  const from = sp.list === "stopped" ? "stopped" : "keeping";
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

  // The list is worked out again here: only donors really on it can be added, whatever ids the link carries. Everyone
  // on it (or everyone ticked) is screened first; only then is the number who join capped.
  const source = winbackSource(sp);
  let raw: string[] = [];
  let plan: Awaited<ReturnType<typeof planWinbackDonors>> | null = null;
  let readFailed = false;
  if (source) {
    try {
      const onList = await winbackListDonors(id, source);
      raw = sp.all === "1" ? onList : ([] as unknown[]).concat(sp.d ?? []).map(String).filter((x) => onList.includes(x.trim().toLowerCase()));
      const { ids } = chosenDonors(raw, WINBACK_SCREEN_CAP);
      plan = ids.length ? await planWinbackDonors(id, ids) : null;
      raw = ids;
    } catch {
      readFailed = true;
    }
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
  if (!source || !plan) {
    return shell(
      <Card title="Nobody chosen">
        <p className="text-sm text-muted">Tick the donors you&apos;d like to win back on the list, or choose &quot;add everyone on this list&quot;. Donors whose details were erased can&apos;t be chosen.</p>
        <p className="mt-3"><Link href={back.href} className={secondaryAction}>Back to the list</Link></p>
      </Card>,
    );
  }
  const { journey, plan: p } = plan;
  if (!journey.enabled || !journey.steps.length) {
    return shell(
      <Card title="Switch your win-back journey on first">
        <p className="text-sm text-muted">Write its emails and switch it on, then come back to this list. Nothing was changed.</p>
        <p className="mt-3"><Link href={`${base}/journey?j=winback`} className={secondaryAction}>Go to your win-back journey</Link></p>
      </Card>,
    );
  }
  const notMine = raw.length - p.add.length - p.left - Object.values(p.skipped).reduce((a, b) => a + b, 0);
  const firstEmail = formatDate(firstDue(new Date(), journey.steps).toISOString());

  return shell(
    <Card title={p.add.length ? `Add ${plural(p.add.length, "donor")}?` : "Nobody to add"}>
      <div className="space-y-3 text-sm">
        {p.left ? (
          <p className="text-muted">
            {plural(p.left + p.add.length, "donor")} on this list can join; {WINBACK_PRESS_CAP} are added at a time. After this, choose &quot;add everyone on this list&quot; again to add the next ones.
          </p>
        ) : null}
        {p.add.length ? (
          <p>
            {plural(p.add.length, "donor")} will get your win-back emails, starting {firstEmail} at the earliest, never more than one message from you a week.{" "}
            {existingSkippedSentence(p.skipped)}
            {notMine > 0 ? ` ${plural(notMine, "donor")} chosen ${notMine === 1 ? "isn't" : "aren't"} one of your donors and ${notMine === 1 ? "is" : "are"} left out.` : ""}
          </p>
        ) : (
          <p className="text-muted">
            {existingSkippedSentence(p.skipped) || "None of the donors chosen can be added."} Nothing was changed.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {p.add.length ? (
            <ActionForm
              action={addWinback.bind(null, id, source, p.add.map((c) => c.donorId))}
              submitLabel={`Add ${plural(p.add.length, "donor")}`}
              pendingLabel="Adding…"
              confirm={`Add ${plural(p.add.length, "donor")} to your win-back journey? You can take this back for 30 minutes, and only for those who haven't had an email yet.`}
              confirmLabel="Yes, add them"
            />
          ) : null}
          <Link href={back.href} className={secondaryAction}>Back to the list</Link>
        </div>
      </div>
    </Card>,
  );
}
