import type { Metadata } from "next";
import { DonorJourneyTabs } from "@/components/donor-journey-tabs";
import { videoFrom } from "@/lib/charity/video";
import { Card, Notice } from "@/components/card";
import { DonePanel } from "@/components/done-panel";
import { PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { appealsThisMonth, listAppeals } from "@/lib/charity/appeals";
import { carryOnLine, carryOnState, type CarryOnState } from "@/lib/charity/carry-on-sends";
import { WHEN_GAVE_LABELS, audienceValue, keepingAudienceLabel, oneDonorLabel, parseAudience } from "@/lib/charity/appeals-rules";
import { isErasedEmail } from "@/lib/charity/dashboard";
import { loadDonors } from "@/lib/charity/dashboard-queries";
import { assistantConfig } from "@/config/assistant";
import { loadDraft } from "@/lib/assistant/drafts";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { lapsedDaysFor, listSegments, listTags } from "@/lib/charity/donor-care";
import { donorGroupsFor } from "@/lib/charity/insights";
import { loadCharityForManager } from "@/lib/charity/queries";
import { can } from "@/lib/charity/permissions";
import { viewerRole } from "@/lib/charity/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/dates";
import { checkAppealAudience, continueAppeal, sendAppealNow, sendTestAppeal } from "./actions";
import { AppealForm, ContinueForm } from "./forms";

// Sending runs until about 40 seconds, then offers "Send the rest"; the daily job may also carry the rest on by itself.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Email donors" };

/**
 * News and appeals by email (Yehuda, 21/10/2026). The owner writes; Givezy sends from its own address,
 * with replies going to the charity. Donors who said no are never emailed, and nobody gets more than 4
 * a month from one charity.
 */
/** The form's choice for one donor, from this charity's own list (read as the person); null when not there or erased. */
async function oneDonorOption(charityId: string, donorId: string): Promise<{ value: string; label: string } | null> {
  const d = (await loadDonors(charityId)).find((r) => r.donor_id === donorId);
  if (!d || isErasedEmail(d.email)) return null;
  return { value: `donor:${d.donor_id}`, label: oneDonorLabel(d.display_name) };
}

export default async function EmailDonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/email-donors">) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await requireViewer(`/charity-admin/${id}/email-donors`);
  const { charity, priv } = await loadCharityForManager(id);
  // A thank-you Givy prepared (24/11/2026): read back only for this person on this charity, before it expires.
  const draft = typeof sp.draft === "string" ? await loadDraft(sp.draft, id, viewer.userId).catch(() => "gone" as const) : null;
  // One donor (24/11/2026, a thank-you Givy prepared to one named donor): looked up again here, in this charity's own
  // list as this person sees it, so an id for another charity's donor (or one erased since) finds nobody.
  const askedFirst = parseAudience(draft && draft !== "gone" ? draft.audience : sp.to);
  const oneDonor = askedFirst?.kind === "donor" ? await oneDonorOption(id, askedFirst.donorId).catch(() => null) : null;
  const donorGone = askedFirst?.kind === "donor" && !oneDonor;
  // A one-donor draft whose donor isn't there is never shown with "All your donors" chosen instead.
  const givy = draft && draft !== "gone" && !donorGone ? draft : null;
  const [role, appeals, recent, tags, segments, campaigns, lapsedDays] = await Promise.all([
    viewerRole(id), listAppeals(id), appealsThisMonth(id), listTags(id), listSegments(id), loadCampaigns(id), lapsedDaysFor(id),
  ]);
  // Emailing donors is part of the "message" role permission (team roles, 10/11/2026).
  const owner = can(role, "message");
  // For each email still waiting: whether the daily job really carries the rest on, by its own rules (review 21/11/2026).
  const carryOn = new Map<string, CarryOnState>(
    await Promise.all(
      appeals
        .filter((a) => a.progress.waiting)
        .map(async (a) => [a.id, await carryOnState({ kind: "appeal", id: a.id, charityId: id, startedBy: a.created_by, startedAt: a.created_at }, { pageLive: charity.status === "approved" })] as const),
    ),
  );
  // "Email these donors" from a list, a tag or a campaign arrives with it chosen.
  const asked = donorGone ? null : askedFirst;
  const audiences = [
    ...(oneDonor ? [{ group: "One donor", options: [oneDonor] }] : []),
    { group: "Everyone", options: [{ value: "all", label: "All your donors" }] },
    // When and how they give (24/11/2026), the groups Givy prepares thank-yous for.
    { group: "When and how they give", options: (Object.keys(WHEN_GAVE_LABELS) as (keyof typeof WHEN_GAVE_LABELS)[]).map((value) => ({ value, label: WHEN_GAVE_LABELS[value] })) },
    { group: "Donor groups", options: donorGroupsFor(lapsedDays).map((g) => ({ value: `group:${g.key}`, label: g.label })) },
    // Keeping donors: who hasn't given since (23/11/2026). Looking back from last tax year comes only from that page's button.
    {
      group: "Keeping donors",
      options: [
        { value: "keeping:lybunt", label: keepingAudienceLabel("lybunt", "this") },
        { value: "keeping:sybunt", label: keepingAudienceLabel("sybunt", "this") },
        ...(asked?.kind === "keeping" && asked.year === "last" ? [{ value: audienceValue(asked), label: keepingAudienceLabel(asked.list, "last") }] : []),
      ],
    },
    ...(segments.length ? [{ group: "Your saved lists", options: segments.map((s) => ({ value: `segment:${s.id}`, label: s.name })) }] : []),
    ...(tags.length ? [{ group: "Tags", options: tags.map((t) => ({ value: `tag:${t.id}`, label: `Tagged "${t.name}"` })) }] : []),
    ...(campaigns.length ? [{ group: "People who gave to a campaign", options: campaigns.filter((c) => c.status !== "draft").map((c) => ({ value: `campaign:${c.id}`, label: c.title })) }] : []),
  ];
  const known = new Set(audiences.flatMap((g) => g.options.map((o) => o.value)));
  const initialAudience = asked && known.has(audienceValue(asked)) ? audienceValue(asked) : "all";
  // "Email this to your donors" from Photos and updates: start from that update's words, with a link to the page.
  const update = typeof sp.update === "string" && /^[0-9a-f-]{36}$/i.test(sp.update)
    ? (await createAdminClient().from("charity_updates").select("body_en").eq("id", sp.update).eq("charity_id", id).maybeSingle()).data
    : null;
  // Whether that update has a video (read on its own: before the video change runs, the update still prefills).
  const updateVideo = update && typeof sp.update === "string"
    ? videoFrom((await createAdminClient().from("charity_updates").select("video_provider, video_id").eq("id", sp.update).eq("charity_id", id).maybeSingle()).data)
    : null;
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  // Never the video's own link: donors watch it on the charity's page, where it plays only after they press play.
  const initialBody = update
    ? `${update.body_en as string}\n\n${updateVideo ? "Watch the video with this update on our page" : "See more on our page"}: ${site}/c/${charity.slug}`.slice(0, 5000)
    : "";
  const initialSubject = update ? `News from ${charity.name_en}`.slice(0, 120) : "";
  const startBody = givy ? givy.body : initialBody;
  const startSubject = givy ? givy.subject : initialSubject;

  return (
    <div className="space-y-5">
      <DonorJourneyTabs id={id} current="/email-donors" />
      <PageHeader
        title="Email donors"
        intro={
          <span className="[overflow-wrap:anywhere]">
            Send your donors news or an appeal. Givezy sends it for you, so you never handle their addresses.
            {priv?.contact_email ? ` Replies go to ${priv.contact_email}.` : ""} Donors who asked not to get emails are always left out, and nobody gets more than 4 from you in a month.
          </span>
        }
      />
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/email-donors`} />

      {charity.status !== "approved" ? (
        <Notice tone="warning">You can email your donors once your page is live.</Notice>
      ) : !owner ? (
        <Notice>Your role doesn&apos;t include emailing donors. You can see what was sent below.</Notice>
      ) : (
        <Card title={givy ? "Check and send Givy's thank-you" : "Write an email"}>
          {givy ? (
            <p role="status" className="mb-3 rounded-card bg-honey-soft p-3 text-sm text-navy">
              Givy prepared this thank-you. <strong className="font-semibold">Nothing has been sent.</strong> Change the words if you like, press Check who it goes to, then send it yourself.
            </p>
          ) : null}
          {donorGone ? (
            <p role="status" className="mb-3 rounded-card bg-warning-soft p-3 text-sm text-warning">
              The donor Givy&apos;s thank-you was for isn&apos;t on your donor list any more (or asked to be erased). Nothing was sent. Ask Givy again, or write your email below.
            </p>
          ) : null}
          {draft === "gone" ? (
            <p role="status" className="mb-3 rounded-card bg-warning-soft p-3 text-sm text-warning">
              Givy&apos;s draft isn&apos;t here any more: drafts are kept for {assistantConfig.draftHours} hours, and only for the person who asked. Nothing was sent. Ask Givy again, or write your email below.
            </p>
          ) : null}
          {recent ? <p className="mb-3 text-sm text-muted">You&apos;ve sent {recent} {recent === 1 ? "email" : "emails"} in the last 30 days.</p> : null}
          <AppealForm
            key={givy && typeof sp.draft === "string" ? sp.draft : "write"}
            check={checkAppealAudience.bind(null, id)}
            test={sendTestAppeal.bind(null, id)}
            send={sendAppealNow.bind(null, id)}
            audiences={audiences}
            initialAudience={initialAudience}
            initialSubject={startSubject}
            initialBody={startBody}
            fromGivy={Boolean(givy)}
            draftId={givy && typeof sp.draft === "string" ? sp.draft : undefined}
          />
        </Card>
      )}

      <Card title="Sent">
        {appeals.length === 0 ? (
          <p className="rounded-control border-2 border-dashed border-honey bg-honey-soft/60 p-4 text-sm text-muted">Nothing sent yet. Your emails appear here, with how many went out.</p>
        ) : (
          <ul className="-mb-3 divide-y divide-border text-sm">
            {appeals.map((a) => (
              <li key={a.id} className="space-y-1 py-3">
                <p className="font-display text-base font-bold text-indigo [overflow-wrap:anywhere]">{a.subject}</p>
                <p className="text-xs text-muted [overflow-wrap:anywhere]">{formatDate(a.created_at)} · {a.audience_label}</p>
                <p className="text-xs font-semibold tabular-nums text-navy">
                  {a.progress.sent} sent
                  {a.progress.skipped ? `, ${a.progress.skipped} left out` : ""}
                  {a.progress.failed ? `, ${a.progress.failed} not sent` : ""}
                  {a.progress.waiting ? `, ${a.progress.waiting} still to send` : ""}
                </p>
                {a.progress.waiting && carryOn.has(a.id) ? <p className="text-xs text-muted">{carryOnLine(carryOn.get(a.id)!, { owner })}</p> : null}
                {a.progress.waiting && owner ? <ContinueForm action={continueAppeal.bind(null, id, a.id)} waiting={a.progress.waiting} /> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted">&quot;Left out&quot; means they asked not to get emails since, already had 4 from you this month, or email isn&apos;t switched on here.</p>
      </Card>
    </div>
  );
}
