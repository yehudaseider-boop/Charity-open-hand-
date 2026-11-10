import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { ActionForm } from "@/components/forms/action-form";
import { requireViewer } from "@/lib/auth";
import { enrolmentLabel, existingSkippedSentence, journeyCounts, journeyTitle, parseRefKey, refKey, sameRef, starterSteps, type JourneyRef } from "@/lib/charity/journey";
import { enrolmentStates, journeyPeople, journeysV2, listJourneys, loadJourney, planExistingDonors } from "@/lib/charity/journey-store";
import { loadCharityForManager } from "@/lib/charity/queries";
import { can } from "@/lib/charity/permissions";
import { viewerRole } from "@/lib/charity/team";
import { WEEKLY_LIMIT } from "@/lib/charity/weekly-limit-rule";
import { formatDate, formatDateTime } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { plural } from "@/lib/text";
import { addExisting, saveJourney, switchJourney } from "./actions";
import { JourneyEditor } from "./editor";

export const metadata: Metadata = { title: "Donor journeys" };

/**
 * The donor journeys (CRM steps 6a, 6b and 7, 10/11/2026): a few emails the charity writes, sent by Givezy in its name.
 * The general journey starts on someone's first gift; a campaign's journey on a first gift to that campaign; the
 * win-back journey takes donors the owner adds from the stopped monthly and keeping-donors lists. The charity never
 * handles addresses; donors can stop the emails with one link. Changes need "message"; adding donors is the owner's.
 */
export default async function JourneyPage({ params, searchParams }: PageProps<"/charity-admin/[id]/journey">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/journey`);
  const { charity } = await loadCharityForManager(id);
  const role = await viewerRole(id);
  // Changing a journey is part of "message"; adding donors stays the owner's (team roles, 10/11/2026).
  const owner = can(role, "message");
  const isTheOwner = role === "owner";
  const approved = charity.status === "approved";
  const v2 = await journeysV2();
  const base = `/charity-admin/${id}`;

  // The charity's own campaigns (for their journeys), newest first.
  const { data: campaignRows, error: campaignError } = v2
    ? await createAdminClient().from("campaigns").select("id, title, status, ends_at").eq("charity_id", id).order("created_at", { ascending: false }).limit(50)
    : { data: [], error: null };
  if (campaignError) throw campaignError;
  const campaigns = (campaignRows ?? []).map((c) => ({ id: c.id as string, title: c.title as string, status: c.status as string, endsAt: (c.ends_at as string | null) ?? null }));
  const titleOf = (campaignId: string | null) => campaigns.find((c) => c.id === campaignId)?.title ?? null;

  const asked = parseRefKey(typeof sp.j === "string" ? sp.j : undefined);
  if (!asked) notFound();
  // A journey other than the general one needs its migration, and a campaign must be this charity's own.
  if (asked.kind !== "general" && !v2) notFound();
  if (asked.kind === "campaign" && !campaigns.some((c) => c.id === asked.campaignId)) notFound();
  const ref: JourneyRef = asked;
  const key = refKey(ref);
  const campaignTitle = ref.kind === "campaign" ? titleOf(ref.campaignId) : null;
  const name = journeyTitle(ref.kind, campaignTitle);

  const [journey, all] = await Promise.all([loadJourney(id, ref), listJourneys(id)]);
  // A journey not made yet has nobody on it (before the migration, the charity's one journey is keyed by the charity).
  const [states, people] = journey.id || (ref.kind === "general" && !v2) ? await Promise.all([enrolmentStates(id, journey), journeyPeople(id, journey)]) : [[], []];
  const counts = journeyCounts(states, journey.steps.length);
  const existing = ref.kind === "general" && isTheOwner && approved && journey.enabled && journey.switchedOnAt && journey.steps.length ? await planExistingDonors(id, journey) : null;
  const firstWait = journey.steps[0]?.waitDays ?? 0;
  const href = (r: JourneyRef) => (r.kind === "general" ? `${base}/journey` : `${base}/journey?j=${encodeURIComponent(refKey(r))}`);
  const status = (r: JourneyRef) => {
    const j = all.find((x) => sameRef(x.ref, r));
    return !j ? "Not set up" : j.enabled ? `On, ${plural(j.stepCount, "email")}` : j.stepCount ? `Off, ${plural(j.stepCount, "email")}` : "Not set up";
  };
  const withoutJourney = campaigns.filter((c) => c.status !== "draft" && !all.some((j) => j.kind === "campaign" && j.campaignId === c.id));
  const joinWords =
    ref.kind === "winback"
      ? "Donors join when you add them from your stopped monthly donors or keeping-donors lists. Anyone who gives again leaves it."
      : ref.kind === "campaign"
        ? "Each donor joins on their first gift to this campaign, from when you switch it on. People who gave to it before aren't added."
        : "Each new donor joins on their first gift.";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Donor journeys"
        intro={
          <>
            A few short emails from you, so a gift turns into a relationship. You write them once; Givezy sends each email in your name, with
            the donor&apos;s first name. You never need their addresses, and they can stop your emails with one link. {WEEKLY_LIMIT} An email that
            meets a week with another message from you waits for the next week.
          </>
        }
      />

      <DonePanel charity={charity} sp={sp} here={href(ref)} />

      {v2 ? (
        <Card title="Your journeys">
          <ul className="divide-y divide-border text-sm">
            {[{ r: { kind: "general" } as JourneyRef, label: "Donor journey", hint: "Everyone's first gift" }, { r: { kind: "winback" } as JourneyRef, label: "Win-back journey", hint: "Donors you add from your lists" }]
              .concat(all.filter((j) => j.kind === "campaign").map((j) => ({ r: j.ref, label: `Journey for ${titleOf(j.campaignId) ?? "a campaign"}`, hint: "A first gift to this campaign" })))
              .map((x) => (
                <li key={refKey(x.r)} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                  {sameRef(x.r, ref) ? (
                    <span className="font-semibold text-navy" dir="auto" aria-current="page">{x.label} (showing)</span>
                  ) : (
                    <Link href={href(x.r)} dir="auto" className="min-w-0 font-semibold text-brand underline [overflow-wrap:anywhere]">{x.label}</Link>
                  )}
                  <span className="text-muted">{x.hint} · {status(x.r)}</span>
                </li>
              ))}
          </ul>
          {withoutJourney.length ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-semibold text-navy">Give a campaign its own journey</p>
              <ul className="flex flex-wrap gap-2">
                {withoutJourney.map((c) => (
                  <li key={c.id}>
                    <Link href={href({ kind: "campaign", campaignId: c.id })} dir="auto" className="inline-flex min-h-11 items-center rounded-control border-2 border-border px-3 font-semibold text-brand [overflow-wrap:anywhere]">
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <h2 className="font-display text-xl font-bold text-indigo" dir="auto">{name}</h2>

      {!approved ? (
        <Notice tone="warning">You can write your emails now. A journey can be switched on once your page is live.</Notice>
      ) : !owner ? (
        <Notice>Your role doesn&apos;t include changing donor journeys. You can see them and who is on them below.</Notice>
      ) : null}

      <Card title="On or off">
        <div id="switch" className="space-y-3 text-sm">
          <p role="status" className="font-semibold text-navy">
            {journey.enabled
              ? `On since ${journey.switchedOnAt ? formatDate(journey.switchedOnAt) : "today"}. ${joinWords}`
              : journey.switchedOnAt
                ? "Off. Nobody gets an email from it and nobody new joins. Everyone on it keeps their place."
                : "Off. It hasn't been switched on yet."}
          </p>
          {journey.updatedAt ? <p className="text-muted">Last changed {formatDateTime(journey.updatedAt)}.</p> : null}
          {owner ? (
            journey.enabled ? (
              <ActionForm key={formKey(sp, "off")} action={switchJourney.bind(null, id, key, false)} submitLabel="Switch it off" pendingLabel="Switching off…" />
            ) : approved && journey.steps.length ? (
              <ActionForm key={formKey(sp, "on")} action={switchJourney.bind(null, id, key, true)} submitLabel="Switch it on" pendingLabel="Switching on…" />
            ) : approved ? (
              <p className="text-muted">Save at least one email below, then switch it on here.</p>
            ) : null
          ) : null}
          <p className="text-muted">
            Emails go out each morning.{" "}
            {ref.kind === "general" ? "Donors who gave before you switched it on can be added below, once it is on." : null}
            {ref.kind === "winback" ? (
              <>
                Add donors from <Link href={`${base}/monthly/stopped`} className="font-semibold text-brand underline">monthly donors who stopped</Link> or{" "}
                <Link href={`${base}/keeping`} className="font-semibold text-brand underline">keeping donors</Link>, once it is on.
              </>
            ) : null}
          </p>
        </div>
      </Card>

      <Card title="Your emails">
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Up to five emails. The first goes 0 to 30 days after someone joins; each next one 7 to 180 days after the one before. Plain words in
            your own voice, no web addresses. Givezy adds a button to your page and the stop link. Changes apply from each donor&apos;s next email.
          </p>
          <JourneyEditor
            key={formKey(sp, `journey-${key}`)}
            action={saveJourney.bind(null, id, key)}
            charityName={charity.name_en}
            slug={charity.slug}
            saved={journey.steps}
            canEdit={owner}
            siteUrl={process.env.SITE_URL}
            starter={starterSteps(ref.kind, campaignTitle)}
          />
        </div>
      </Card>

      <Card title="Who is on it">
        <div id="people" className="space-y-4 text-sm">
          {counts.total === 0 ? (
            <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-muted">
              {ref.kind === "winback"
                ? journey.enabled
                  ? "Nobody yet. Add donors from your stopped monthly donors or keeping-donors lists."
                  : "Nobody yet. Switch it on, then add donors from your lists."
                : journey.enabled
                  ? "Nobody yet. The next person who gives for the first time joins the next morning."
                  : "Nobody yet. Switch the journey on and donors join from their first gift."}
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
                    <span className="font-display text-xl font-bold text-indigo tabular-nums">{counts.stopped}</span>{" "}
                    <span className="text-muted">
                      stopped (turned off your emails, erased, no address, no gift any more, emails couldn&apos;t be delivered{ref.kind === "winback" ? ", or gave again" : ""})
                    </span>
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
                        {p.source === "existing" || p.source === "winback" ? " (added)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </Card>

      {ref.kind === "general" && isTheOwner && approved ? (
        <Card title="Add your existing donors">
          <div id="existing" className="space-y-3 text-sm">
            {!journey.enabled || !existing ? (
              <p className="text-muted">Once your journey is on, you can add the people who gave before it started. They begin at email 1.</p>
            ) : existing.add.length === 0 ? (
              <p className="text-muted">Nobody to add. {existingSkippedSentence(existing.skipped)}</p>
            ) : (
              <>
                <p>
                  {plural(existing.add.length, "donor")} who first gave before your journey was switched on can join it. They begin at email 1, and never get more than one
                  message from you a week. {existingSkippedSentence(existing.skipped)}
                </p>
                <ActionForm
                  key={formKey(sp, "existing")}
                  action={addExisting.bind(null, id)}
                  submitLabel={`Add ${plural(existing.add.length, "donor")}`}
                  pendingLabel="Adding…"
                  confirm={`Add ${plural(existing.add.length, "donor")} to your journey? Their first email goes ${firstWait === 0 ? "from the next morning" : `about ${plural(firstWait, "day")} from now, in the morning`}. You can take this back for 30 minutes, and only for those who haven't had an email yet.`}
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
