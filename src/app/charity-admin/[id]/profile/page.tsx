import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { DonePanel, formKey } from "@/components/done-panel";
import { requireViewer } from "@/lib/auth";
import { loadCategories, loadCharityForManager, publicImageUrl } from "@/lib/charity/queries";
import { saveDonationEmails, saveProfile, uploadImage } from "./actions";
import { DonationEmailsForm, ImageForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Public profile" };

export default async function ProfilePage({ params, searchParams }: PageProps<"/charity-admin/[id]/profile">) {
  const { id } = await params;
  const sp = await searchParams;
  // A fresh form after each action (the saved values come from the server).
  const k = formKey(sp);
  await requireViewer(`/charity-admin/${id}/profile`);
  const [{ charity, priv, categoryIds }, categories] = await Promise.all([loadCharityForManager(id), loadCategories()]);
  const logo = publicImageUrl(charity.logo_path);
  const cover = publicImageUrl(charity.cover_path);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/charity-admin" className="text-sm text-muted">← Your charities</Link>
        <h1 className="mt-1 font-display text-2xl text-indigo">Public profile</h1>
        {charity.status === "approved" ? (
          <Link href={`/c/${charity.slug}`} className="text-sm text-brand underline">View your public page</Link>
        ) : (
          <p className="text-sm text-muted">Your profile goes public once your application is approved.</p>
        )}
      </div>
      <DonePanel charity={charity} sp={sp} here={`/charity-admin/${id}/profile`} />
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
      <Card title="Emails">
        <DonationEmailsForm key={k} action={saveDonationEmails.bind(null, id)} on={priv?.notify_donations !== false} email={priv?.contact_email ?? null} />
      </Card>
      <Card title="Logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="mb-3 h-20 w-20 rounded-card border border-border object-cover" /> : null}
        <ImageForm key={k} action={uploadImage.bind(null, id, "logo")} label="Square image works best" />
      </Card>
      <Card title="Cover image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover ? <img src={cover} alt="" className="mb-3 aspect-[3/1] w-full rounded-card border border-border object-cover" /> : null}
        <ImageForm key={k} action={uploadImage.bind(null, id, "cover")} label="Wide image, about 3 times wider than tall" />
      </Card>
    </div>
  );
}
