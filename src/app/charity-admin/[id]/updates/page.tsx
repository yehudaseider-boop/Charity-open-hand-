import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { EmptyState, PageHeader } from "@/components/dash";
import { DonePanel, formKey } from "@/components/done-panel";
import { RemoveButton } from "@/components/forms/remove-button";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager, loadStories, publicImageUrl } from "@/lib/charity/queries";
import { viewerRole } from "@/lib/charity/team";
import { MAX_PHOTOS } from "@/lib/charity/validation";
import { formatDate } from "@/lib/dates";
import { addPhoto, postUpdate, removePhoto, removeUpdate } from "./actions";
import { PhotoForm, UpdateForm } from "./forms";

export const metadata: Metadata = { title: "Photos and updates" };

export default async function UpdatesPage({ params, searchParams }: PageProps<"/charity-admin/[id]/updates">) {
  const { id } = await params;
  const sp = await searchParams;
  const k = formKey(sp);
  await requireViewer(`/charity-admin/${id}/updates`);
  const { charity } = await loadCharityForManager(id);
  const [{ photos, updates }, role] = await Promise.all([loadStories(id), viewerRole(id)]);
  // Donors only see updates when they visit the page: the owner can email one to them too.
  const canEmail = role === "owner" && charity.status === "approved";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Photos and updates"
        intro={
          <>
            Show donors the real work. These appear on your page on the website and in the Givezy app
            {charity.status === "approved" ? "." : " once your application is approved."} Only post photos you have permission to share, and
            never show a family who receives help without their consent.
          </>
        }
      />

      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/updates`} />

      <Card title="Post an update">
        <UpdateForm key={k} action={postUpdate.bind(null, id)} />
      </Card>

      {updates.length ? (
        <Card title="Your updates">
          <ul className="divide-y divide-border">
            {updates.map((u) => {
              const photo = publicImageUrl(u.photo_path);
              return (
                <li key={u.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <p className="text-xs font-semibold text-muted">{formatDate(u.created_at)}</p>
                  <p className="whitespace-pre-line text-[0.95rem] text-navy [overflow-wrap:anywhere]">{u.body_en}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt="" className="aspect-[4/3] w-full max-w-sm rounded-card border-2 border-border object-cover" /> : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {canEmail ? <Link href={`/charity-admin/${id}/email-donors?update=${u.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline hover:text-indigo">Email this to your donors</Link> : null}
                    <form action={removeUpdate.bind(null, id, u.id)}>
                      <RemoveButton what={`the update from ${formatDate(u.created_at)}`} ask={false} />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card title={`Photos (${photos.length} of ${MAX_PHOTOS})`}>
        {photos.length ? (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicImageUrl(p.storage_path)!} alt={p.caption_en ?? ""} className="aspect-square w-full rounded-card border-2 border-border object-cover" />
                {p.caption_en ? <p className="text-xs text-muted [overflow-wrap:anywhere]">{p.caption_en}</p> : null}
                <form action={removePhoto.bind(null, id, p.id)}>
                  <RemoveButton what={p.caption_en ? `the photo "${p.caption_en}"` : "this photo"} ask={false} />
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mb-4">
            <EmptyState title="No photos yet">Photos of the work itself (parcels, a class, your building) mean the most to donors.</EmptyState>
          </div>
        )}
        {photos.length < MAX_PHOTOS ? <PhotoForm key={k} action={addPhoto.bind(null, id)} /> : <p className="text-sm text-muted">Remove a photo to add another.</p>}
      </Card>
    </div>
  );
}
