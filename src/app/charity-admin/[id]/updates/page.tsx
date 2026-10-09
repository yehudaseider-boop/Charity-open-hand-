import type { Metadata } from "next";
import { Card } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager, loadStories, publicImageUrl } from "@/lib/charity/queries";
import { MAX_PHOTOS } from "@/lib/charity/validation";
import { formatDate } from "@/lib/dates";
import { addPhoto, postUpdate, removePhoto, removeUpdate } from "./actions";
import { PhotoForm, UpdateForm } from "./forms";

export const metadata: Metadata = { title: "Photos and updates" };

export default async function UpdatesPage({ params }: PageProps<"/charity-admin/[id]/updates">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/updates`);
  const { charity } = await loadCharityForManager(id);
  const { photos, updates } = await loadStories(id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Photos and updates</h1>
        <p className="text-sm text-muted">
          Show donors the real work. These appear on your page on the website and in the NEDIV lev app
          {charity.status === "approved" ? "." : " once your application is approved."} Only post photos you have permission to share, and
          never show a family who receives help without their consent.
        </p>
      </div>

      <Card title="Post an update">
        <UpdateForm action={postUpdate.bind(null, id)} />
      </Card>

      {updates.length ? (
        <Card title="Your updates">
          <ul className="divide-y divide-border">
            {updates.map((u) => {
              const photo = publicImageUrl(u.photo_path);
              return (
                <li key={u.id} className="space-y-2 py-3">
                  <p className="text-xs text-muted">{formatDate(u.created_at)}</p>
                  <p className="whitespace-pre-line text-[0.95rem]">{u.body_en}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photo ? <img src={photo} alt="" className="aspect-[4/3] w-full max-w-sm rounded-card border border-border object-cover" /> : null}
                  <form action={removeUpdate.bind(null, id, u.id)}>
                    <button className="text-xs text-danger underline">Remove</button>
                  </form>
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
                <img src={publicImageUrl(p.storage_path)!} alt={p.caption_en ?? ""} className="aspect-square w-full rounded-card border border-border object-cover" />
                {p.caption_en ? <p className="text-xs text-muted">{p.caption_en}</p> : null}
                <form action={removePhoto.bind(null, id, p.id)}>
                  <button className="text-xs text-danger underline">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-muted">No photos yet. Photos of the work itself (parcels, the shiur, the shul) mean the most to donors.</p>
        )}
        {photos.length < MAX_PHOTOS ? <PhotoForm action={addPhoto.bind(null, id)} /> : <p className="text-sm text-muted">Remove a photo to add another.</p>}
      </Card>
    </div>
  );
}
