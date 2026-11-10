import type { Metadata } from "next";
import { Card, Notice } from "@/components/card";
import { DonePanel, formKey } from "@/components/done-panel";
import { PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { can } from "@/lib/charity/permissions";
import { viewerRole } from "@/lib/charity/team";
import { monthLabel, recentMonths } from "@/lib/charity/thank-you";
import { thankYouRecipients } from "@/lib/charity/thank-you-send";
import { WEEKLY_LIMIT } from "@/lib/charity/weekly-limit-rule";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { thankYouNoteToShow } from "@/lib/charity/thank-you-note";
import { saveThankYouWording, sendRestOfThankYou, sendThankDonors } from "./actions";
import { SendRestForm, ThankYouForm } from "./forms";
import { WordingEditor } from "./wording-editor";

export const metadata: Metadata = { title: "Thank donors" };

// Sending runs until about 40 seconds, then offers "Send the rest".
export const maxDuration = 60;

/**
 * Write one thank-you and Givezy emails it to everyone who gave in that month. The charity never
 * sees or downloads the addresses for this, and donors can stop these emails with one link.
 */
export default async function ThankDonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/thank-donors">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/thank-donors`);
  const { charity } = await loadCharityForManager(id);
  // Only the owner sends thank-yous (Yehuda, 02/11/2026), as for Email donors. Others see what was sent.
  const role = await viewerRole(id);
  const owner = can(role, "message");
  const canWord = can(role, "profile");
  const supabase = await createClient();
  const { data: sentRows } = await supabase
    .from("charity_thank_yous")
    .select("id, period_month, body, sent_at, recipient_count, finished_at")
    .eq("charity_id", id)
    .order("period_month", { ascending: false })
    .limit(24);
  const sent = new Map((sentRows ?? []).map((r) => [r.period_month as string, r]));
  const months = recentMonths(new Date());
  // A thank-you that stopped part way (it ran out of time) and how many donors it hasn't reached yet.
  const unfinished = owner && charity.status === "approved"
    ? await Promise.all((sentRows ?? []).filter((r) => !r.finished_at).map(async (r) => ({ month: r.period_month as string, sent: Number(r.recipient_count ?? 0), total: (await thankYouRecipients(id, r.period_month as string)).length })))
    : [];
  const open = owner && charity.status === "approved"
    ? await Promise.all(months.filter((m) => !sent.has(m)).map(async (m) => ({ month: m, count: (await thankYouRecipients(id, m)).length })))
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Thank donors"
        intro={
          <>
            A short thank-you is the biggest reason people give again. Write it once and we email it to everyone who gave that month,
            with their first name. You don&apos;t need their addresses, and they can stop these emails at any time. One thank-you per month.
            {" "}{WEEKLY_LIMIT} Anyone who already had one this week is left out, and the page tells you how many.
          </>
        }
      />

      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/thank-donors`} />

      {/* The automatic email after each gift: the charity's own paragraph in it (10/11/2026). Anyone who manages the charity may edit it, as for the public profile. */}
      <Card title="The thank-you email after each gift">
        <div id="wording" className="space-y-4 text-sm">
          <p className="text-muted">
            Every donor gets this email from Givezy as soon as their gift is confirmed. You can add a short note of your own to it.
            The same note shows on the thank-you page after they pay and in the Givezy app.
          </p>
          {canWord ? <WordingEditor
            key={formKey(sp, "wording")}
            action={saveThankYouWording.bind(null, id)}
            charityName={charity.name_en}
            saved={thankYouNoteToShow(charity.thank_you_en)}
            sampleDate={new Date().toISOString()}
            siteUrl={process.env.SITE_URL}
          /> : <Notice>Your role doesn&apos;t include changing this note.</Notice>}
        </div>
      </Card>

      <h2 className="font-display text-xl font-bold text-indigo">A thank-you for a whole month</h2>

      {charity.status !== "approved" ? (
        <Notice tone="warning">You can thank donors once your page is live.</Notice>
      ) : !owner ? (
        <Notice>Your role doesn&apos;t include sending thank-yous. You can see what was sent below.</Notice>
      ) : null}

      {unfinished.map(({ month, sent: done, total }) => (
        <Card key={`rest-${month}`} title={`${monthLabel(month)}: not finished`}>
          <div id="unfinished" className="space-y-3 text-sm">
            <p>
              Your thank-you went to {done} {done === 1 ? "donor" : "donors"} before it stopped. About {Math.max(0, total - done)} still to go. Nobody gets it twice.
            </p>
            <SendRestForm action={sendRestOfThankYou.bind(null, id, month)} confirm={`Send the same thank-you to the donors in ${monthLabel(month)} who haven't had it yet?`} />
          </div>
        </Card>
      ))}

      {open.map(({ month, count }) => (
        <Card key={month} title={`${monthLabel(month)}: ${count} ${count === 1 ? "donor" : "donors"}`}>
          {count ? (
            <ThankYouForm
              action={sendThankDonors.bind(null, id, month)}
              defaultBody={charity.thank_you_en ?? ""}
              confirm={`Email this thank-you to ${count} ${count === 1 ? "donor" : "donors"} who gave in ${monthLabel(month)}? Once sent it can't be taken back, and you can only send one for this month${month === months[0] ? ". The month isn't over: people who give later this month won't get it" : ""}.`}
            />
          ) : (
            <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm text-muted">Nobody to thank for this month yet.</p>
          )}
        </Card>
      ))}

      {sentRows?.length ? (
        <Card title="Sent">
          <ul className="-mb-3 divide-y divide-border text-sm">
            {sentRows.map((r) => (
              <li key={r.id} className="space-y-1 py-3">
                <p className="font-semibold text-navy">
                  <span className="font-display text-base font-bold text-indigo">{monthLabel(r.period_month as string)}</span> <span className="font-normal text-muted">· {!r.finished_at ? `started ${formatDate(r.sent_at as string)}, not finished: ${r.recipient_count} sent so far` : `sent ${formatDate(r.sent_at as string)} to ${r.recipient_count} ${r.recipient_count === 1 ? "donor" : "donors"}`}</span>
                </p>
                <p className="whitespace-pre-line rounded-control bg-honey-soft p-3 text-muted [overflow-wrap:anywhere]">{r.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
