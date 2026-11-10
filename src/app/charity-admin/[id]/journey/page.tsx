import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { ActionForm } from "@/components/forms/action-form";
import { requireViewer } from "@/lib/auth";
import { enrolmentLabel, existingSkippedSentence, journeyCounts } from "@/lib/charity/journey";
import { enrolmentStates, journeyPeople, loadJourney, planExistingDonors } from "@/lib/charity/journey-store";
import { loadCharityForManager } from "@/lib/charity/queries";
import { viewerRole } from "@/lib/charity/team";
import { WEEKLY_LIMIT } from "@/lib/charity/weekly-limit-rule";
import { formatDate, formatDateTime } from "@/lib/dates";
import { plural } from "@/lib/text";
import { addExisting, saveJourney, switchJourney } from "./actions";
import { JourneyEditor } from "./editor";

export const metadata: Metadata = { title: "Donor journey" };

/**
 * The donor journey (CRM step 6a, 10/11/2026): a few emails the charity writes, sent by Givezy in its name, starting
 * when someone first gives. The charity never handles addresses; donors can stop the emails with one link. Owner
 * only for changes; other admins see it.
 */
export default async function JourneyPage({ params, searchParams }: PageProps<"/charity-admin/[id]/journey">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/journey`);
  const { charity } = await loadCharityForManager(id);
  const owner = (await viewerRole(id)) === "owner";
  const approved = charity.status === "approved";
  const journey = await loadJourney(id);
  const [states, people] = await Promise.all([enrolmentStates(id), journeyPeople(id)]);
  const counts = journeyCounts(states, journey.steps.length);
  const existing = owner && approved && journey.enabled && journey.steps.length ? await planExistingDonors(id) : null;
  const base = `/charity-admin/${id}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Donor journey"
        intro={
          <>
            A few short emails from you in a donor&apos;s first months, so a first gift turns into a relationship. You write them once;
            each new donor joins on their first gift and Givezy sends each email in your name, with their first name. You never need their
            addresses, and they can stop your emails with one link. {WEEKLY_LIMIT} An email that meets a week with another message from you waits
            for the next week.
          </>
        }
      />

      <DonePanel charity={charity} sp={sp} here={`${base}/journey`} />

      {!approved ? (
        <Notice tone="warning">You can write your emails now. The journey can be switched on once your page is live.</Notice>
      ) : !owner ? (
        <Notice>Only your charity&apos;s owner can change the donor journey. You can see it and who is on it below.</Notice>
      ) : null}

      <Card title="On or off">
        <div id="switch" className="space-y-3 text-sm">
          <p role="status" className="font-semibold text-navy">
            {journey.enabled
              ? `On since ${journey.switchedOnAt ? formatDate(journey.switchedOnAt) : "today"}. New donors join on their first gift.`
              : journey.switchedOnAt
                ? `Off. Nobody gets a journey email and nobody new joins. Everyone on it keeps their place.`
                : "Off. It hasn't been switched on yet."}
          </p>
          {journey.updatedAt ? <p className="text-muted">Last changed {formatDateTime(journey.updatedAt)}.</p> : null}
          {owner ? (
            journey.enabled ? (
              <ActionForm key={formKey(sp, "off")} action={switchJourney.bind(null, id, false)} submitLabel="Switch it off" pendingLabel="Switching off…" />
            ) : approved && journey.steps.length ? (
              <ActionForm key={formKey(sp, "on")} action={switchJourney.bind(null, id, true)} submitLabel="Switch it on" pendingLabel="Switching on…" />
            ) : approved ? (
              <p className="text-muted">Save at least one email below, then switch it on here.</p>
            ) : null
          ) : null}
          <p className="text-muted">Emails go out each morning. Donors who gave before you switched it on can be added below, once it is on.</p>
        </div>
      </Card>

      <Card title="Your emails">
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Up to five emails. The first goes 0 to 30 days after someone joins; each next one 7 to 180 days after the one before. Plain words in
            your own voice, no web addresses. Givezy adds a button to your page and the stop link. Changes apply from each donor&apos;s next email.
          </p>
          <JourneyEditor
            key={formKey(sp, "journey")}
            action={saveJourney.bind(null, id)}
            charityName={charity.name_en}
            slug={charity.slug}
            saved={journey.steps}
            canEdit={owner}
            siteUrl={process.env.SITE_URL}
          />
        </div>
      </Card>

      <Card title="Who is on it">
        <div id="people" className="space-y-4 text-sm">
          {counts.total === 0 ? (
            <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-muted">
              {journey.enabled ? "Nobody yet. The next person who gives for the first time joins the next morning." : "Nobody yet. Switch the journey on and new donors join from their first gift."}
            </p>
          ) : (
            <>
              <ul className="grid gap-2 sm:grid-cols-2">
                {counts.waiting.map((n, i) => (
                  <li key={i} className="rounded-card bg-honey-soft p-3">
                    <span className="font-display text-xl font-bold text-indigo tabular-nums">{n}</span> <span className="text-muted">waiting for email {i + 1}</span>
                  </li>
                ))}
                <li className="rounded-card bg-honey-soft p-3">
                  <span className="font-display text-xl font-bold text-indigo tabular-nums">{counts.finished}</span> <span className="text-muted">had every email</span>
                </li>
                {counts.stopped ? (
                  <li className="rounded-card bg-honey-soft p-3">
                    <span className="font-display text-xl font-bold text-indigo tabular-nums">{counts.stopped}</span> <span className="text-muted">stopped (turned off your emails, erased, or no address)</span>
                  </li>
                ) : null}
              </ul>
              <div className="space-y-2">
                <p className="font-semibold text-navy">
                  {counts.total > people.length ? `The ${people.length} most recent of ${plural(counts.total, "person", "people")}` : plural(counts.total, "person", "people")}
                </p>
                <ul className="-mb-3 divide-y divide-border">
                  {people.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                      <Link href={`${base}/donors/${p.donorId}`} dir="auto" className="min-w-0 font-semibold text-brand underline [overflow-wrap:anywhere]">
                        {p.name}
                      </Link>
                      <span className="text-muted">
                        {enrolmentLabel(p, journey.steps.length, formatDate)} · joined {formatDate(p.enrolled_at)}
                        {p.source === "existing" ? " (added)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </Card>

      {owner && approved ? (
        <Card title="Add your existing donors">
          <div id="existing" className="space-y-3 text-sm">
            {!journey.enabled || !existing ? (
              <p className="text-muted">Once your journey is on, you can add the people who gave before it started. They begin at email 1.</p>
            ) : existing.add.length === 0 ? (
              <p className="text-muted">Nobody to add. {existingSkippedSentence(existing.skipped)}</p>
            ) : (
              <>
                <p>
                  {plural(existing.add.length, "donor")} who gave before your journey started can join it. They begin at email 1, and never get more than one
                  message from you a week. {existingSkippedSentence(existing.skipped)}
                </p>
                <ActionForm
                  key={formKey(sp, "existing")}
                  action={addExisting.bind(null, id)}
                  submitLabel={`Add ${plural(existing.add.length, "donor")}`}
                  pendingLabel="Adding…"
                  confirm={`Add ${plural(existing.add.length, "donor")} to your journey? Their first email goes from the next morning. You can take this back for 30 minutes, until anyone has had an email.`}
                  confirmLabel="Yes, add them"
                />
              </>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
