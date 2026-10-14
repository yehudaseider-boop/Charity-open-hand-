import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { loadCategories, loadCharityForManager, publicImageUrl } from "@/lib/charity/queries";
import { saveProfile, uploadImage } from "./actions";
import { ImageForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Edit profile" };

export default async function ProfilePage({ params }: PageProps<"/charity-admin/[id]/profile">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/profile`);
  const [{ charity, categoryIds }, categories] = await Promise.all([loadCharityForManager(id), loadCategories()]);
  const logo = publicImageUrl(charity.logo_path);
  const cover = publicImageUrl(charity.cover_path);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/charity-admin" className="text-sm text-muted">← Your charities</Link>
        <h1 className="mt-1 text-xl font-semibold">Public profile</h1>
        {charity.status === "approved" ? (
          <Link href={`/c/${charity.slug}`} className="text-sm text-brand underline">View your public page</Link>
        ) : (
          <p className="text-sm text-muted">Your profile goes public once your application is approved.</p>
        )}
      </div>
      <Card title="Details">
        <ProfileForm action={saveProfile.bind(null, id)} charity={charity} categories={categories} selected={categoryIds} />
      </Card>
      <Card title="Logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="mb-3 h-20 w-20 rounded-card border border-border object-cover" /> : null}
        <ImageForm action={uploadImage.bind(null, id, "logo")} label="Square image works best" />
      </Card>
      <Card title="Cover image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover ? <img src={cover} alt="" className="mb-3 aspect-[3/1] w-full rounded-card border border-border object-cover" /> : null}
        <ImageForm action={uploadImage.bind(null, id, "cover")} label="Wide image, about 3 times wider than tall" />
      </Card>
    </div>
  );
}
