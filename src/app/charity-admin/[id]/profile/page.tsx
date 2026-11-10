import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { ActionLink, PageHeader } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { requireViewer } from "@/lib/auth";
import { loadCategories, loadCharityForManager, publicImageUrl } from "@/lib/charity/queries";
import { Badge } from "@/components/badge";
import { ProfileVideo } from "@/components/profile-video";
import { loadCampaigns } from "@/lib/charity/campaign-queries";
import { isRunning } from "@/lib/charity/campaigns";
import { FOCUS_STATUS_LABEL, focusDay, focusFrom, focusStatus, jhbToday } from "@/lib/charity/focus";
import { loadFocusForManager, loadVideo } from "@/lib/charity/profile-extras";
import { VIDEO_PROVIDER_NAME, videoWatchUrl } from "@/lib/charity/video";
import { removeFocus, removeVideo, saveDonationEmails, saveFocus, saveProfile, saveVideo, uploadImage } from "./actions";
import { DonationEmailsForm, FocusForm, ImageForm, ProfileForm, RemoveForm, VideoForm } from "./forms";
import { viewerCan } from "@/lib/charity/team";

export const metadata: Metadata = { title: "Public profile" };

export default async function ProfilePage({ params, searchParams }: PageProps<"/charity-admin/[id]/profile">) {
  const { id } = await params;
  const sp = await searchParams;
  // A fresh form after each action (the saved values come from the server).
  const k = formKey(sp);
  await requireViewer(`/charity-admin/${id}/profile`);
  const [{ charity, priv, categoryIds }, categories] = await Promise.all([loadCharityForManager(id), loadCategories()]);
  const canEdit = await viewerCan(id, "profile");
  const now = new Date();
  // Bonuses: if either can't be read, the rest of the page still works and its card says so.
  const [video, focusLoad, allCampaigns] = await Promise.all([loadVideo(id), loadFocusForManager(id), loadCampaigns(id).catch(() => [])]);
  const campaigns = allCampaigns.filter((c) => isRunning(c, now)).map((c) => ({ id: c.id, title: c.title }));
  const focus = focusFrom(focusLoad.row);
  const status = focus ? focusStatus(focus, jhbToday(now)) : null;
  const approved = charity.status === "approved";
  const logo = publicImageUrl(charity.logo_path);
  const cover = publicImageUrl(charity.cover_path);

  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href="/charity-admin" className="text-muted hover:text-brand hover:underline">← Your charities</Link>}
        title="Public profile"
        intro={charity.status === "approved" ? undefined : "Your profile goes public once your application is approved."}
        actions={charity.status === "approved" ? <ActionLink href={`/c/${charity.slug}`}>View your public page</ActionLink> : undefined}
      />
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/profile`} />
      {!canEdit ? <Notice>Your role doesn&apos;t include changing your charity&apos;s page. You can see it here, but the forms are switched off.</Notice> : null}
      {/* Switched off as a whole for a role that can't save (the server refuses anyway). */}
      <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <Card title="Details">
        <ProfileForm
          key={k}
          action={saveProfile.bind(null, id)}
          // Only what the form edits reaches the browser: the full row holds gateway and mandate details.
          charity={{
            name_en: charity.name_en, description_en: charity.description_en, funds_use_en: charity.funds_use_en, thank_you_en: charity.thank_you_en,
            impact_en: charity.impact_en, suggested_amounts_cents: charity.suggested_amounts_cents, website: charity.website,
            impact_unit_cents: charity.impact_unit_cents, impact_unit_one: charity.impact_unit_one, impact_unit_many: charity.impact_unit_many,
          }}
          categories={categories}
          selected={categoryIds}
        />
      </Card>
      <Card
        title="What we're focused on right now"
        aside={status ? <Badge tone={status === "showing" ? "success" : status === "scheduled" ? "brand" : "neutral"}>{FOCUS_STATUS_LABEL[status]}</Badge> : undefined}
      >
        {focusLoad.available ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              One thing you want donors to know about now: a campaign, or a few words of your own. Between the days you choose it shows as a highlighted
              card at the top of your public page and your page in the Givezy app, with a button to give. Outside those days it simply doesn&apos;t show.
              One at a time. We don&apos;t send a notification about it.
            </p>
            {focus && status ? (
              <p className="rounded-control bg-honey-soft p-3 text-sm" role="status">
                <span className="font-semibold" dir="auto">{focus.title}</span>{": "}
                {status === "showing"
                  ? approved ? `showing now, until the end of ${focusDay(focus.endsOn)}.` : `set for now, until the end of ${focusDay(focus.endsOn)}. Donors see it once your application is approved.`
                  : status === "scheduled"
                    ? `scheduled. It shows from ${focusDay(focus.startsOn)} to ${focusDay(focus.endsOn)}${approved ? "" : ", once your application is approved"}.`
                    : `ended on ${focusDay(focus.endsOn)}. It no longer shows. Change the days to show it again, or remove it.`}
              </p>
            ) : (
              <p className="rounded-control bg-honey-soft p-3 text-sm">You have no focus set, so nothing extra shows on your page.</p>
            )}
            <FocusForm key={`focus-${k}`} action={saveFocus.bind(null, id)} focus={focusLoad.row} campaigns={campaigns} />
            {focusLoad.row ? <RemoveForm key={`focus-remove-${k}`} action={removeFocus.bind(null, id)} label="Remove focus" /> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">This isn&apos;t switched on here yet. Nothing on your page has changed.</p>
        )}
      </Card>
      <Card title="Video">
        {video.available ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              A video from YouTube or Vimeo, shown on your public page as &quot;Watch our video&quot; and as a button on your page in the Givezy app.
              Visitors load nothing from YouTube or Vimeo until they press play.
            </p>
            {video.video ? (
              <div className="max-w-xl space-y-2">
                <p className="text-sm font-semibold">How it looks on your page{approved ? "" : " once your application is approved"} ({VIDEO_PROVIDER_NAME[video.video.provider]})</p>
                <ProfileVideo key={`${video.video.provider}-${video.video.id}`} video={video.video} charityName={charity.name_en} />
              </div>
            ) : (
              <p className="rounded-control bg-honey-soft p-3 text-sm">No video yet, so your page shows no video block.</p>
            )}
            <VideoForm key={`video-${k}`} action={saveVideo.bind(null, id)} link={video.video ? videoWatchUrl(video.video) : null} />
            {video.video ? <RemoveForm key={`video-remove-${k}`} action={removeVideo.bind(null, id)} label="Remove video" /> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">This isn&apos;t switched on here yet. Nothing on your page has changed.</p>
        )}
      </Card>
      <Card title="Emails">
        <DonationEmailsForm key={k} action={saveDonationEmails.bind(null, id)} on={priv?.notify_donations !== false} email={priv?.contact_email ?? null} />
      </Card>
      <Card title="Logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="mb-3 h-20 w-20 rounded-card border-2 border-border object-cover" /> : null}
        <ImageForm key={k} action={uploadImage.bind(null, id, "logo")} label="Square image works best" />
      </Card>
      <Card title="Cover image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover ? <img src={cover} alt="" className="mb-3 aspect-[3/1] w-full rounded-card border-2 border-border object-cover" /> : null}
        <ImageForm key={k} action={uploadImage.bind(null, id, "cover")} label="Wide image, about 3 times wider than tall" />
      </Card>
      </fieldset>
    </div>
  );
}
