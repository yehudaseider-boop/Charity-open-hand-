import type { Metadata } from "next";
import { Card, Notice } from "@/components/card";
import { DonePanel } from "@/components/done-panel";
import { PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { appealsThisMonth, listAppeals } from "@/lib/charity/appeals";
import { audienceValue, parseAudience } from "@/lib/charity/appeals-rules";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { lapsedDaysFor, listSegments, listTags } from "@/lib/charity/donor-care";
import { donorGroupsFor } from "@/lib/charity/insights";
import { loadCharityForManager } from "@/lib/charity/queries";
import { viewerRole } from "@/lib/charity/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/dates";
import { checkAppealAudience, continueAppeal, sendAppealNow, sendTestAppeal } from "./actions";
import { AppealForm, ContinueForm } from "./forms";

// Sending runs until about 40 seconds, then offers "Send the rest".
export const maxDuration = 60;

export const metadata: Metadata = { title: "Email donors" };

/**
 * News and appeals by email (Yehuda, 21/10/2026). The owner writes; Givezy sends from its own address,
 * with replies going to the charity. Donors who said no are never emailed, and nobody gets more than 4
 * a month from one charity.
 */
export default async function EmailDonorsPage({ params, searchParams }: PageProps<"/charity-admin/[id]/email-donors">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/email-donors`);
  const { charity, priv } = await loadCharityForManager(id);
  const [role, appeals, recent, tags, segments, campaigns, lapsedDays] = await Promise.all([
    viewerRole(id), listAppeals(id), appealsThisMonth(id), listTags(id), listSegments(id), loadCampaigns(id), lapsedDaysFor(id),
  ]);
  const owner = role === "owner";
  // "Email these donors" from a list, a tag or a campaign arrives with it chosen.
  const asked = parseAudience(sp.to);
  const audiences = [
    { group: "Everyone", options: [{ value: "all", label: "All your donors" }] },
    { group: "Donor groups", options: donorGroupsFor(lapsedDays).map((g) => ({ value: `group:${g.key}`, label: g.label })) },
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
  const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
  const initialBody = update ? `${update.body_en as string}\n\nSee more on our page: ${site}/c/${charity.slug}`.slice(0, 5000) : "";
  const initialSubject = update ? `News from ${charity.name_en}`.slice(0, 120) : "";

  return (
    <div className="space-y-5">
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
        <Notice>Only your charity&apos;s owner can email donors. You can see what was sent below.</Notice>
      ) : (
        <Card title="Write an email">
          {recent ? <p className="mb-3 text-sm text-muted">You&apos;ve sent {recent} {recent === 1 ? "email" : "emails"} in the last 30 days.</p> : null}
          <AppealForm
            check={checkAppealAudience.bind(null, id)}
            test={sendTestAppeal.bind(null, id)}
            send={sendAppealNow.bind(null, id)}
            audiences={audiences}
            initialAudience={initialAudience}
            initialSubject={initialSubject}
            initialBody={initialBody}
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
