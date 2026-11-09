import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/card";
import { PageHeader, secondaryAction } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { loadCharityForManager } from "@/lib/charity/queries";
import { PosterView } from "./view";

export const metadata: Metadata = { title: "QR poster" };

/**
 * A printable A4 poster: the charity's name, a large QR code to its Givezy page, and one line on how
 * to use it. For a notice board, a front desk or an event table.
 */
export default async function PosterPage({ params, searchParams }: PageProps<"/charity-admin/[id]/poster">) {
  const { id } = await params;
  const sp = await searchParams;
  await requireViewer(`/charity-admin/${id}/poster`);
  const { charity } = await loadCharityForManager(id);
  if (charity.status !== "approved") {
    return (
      <div className="space-y-5">
        <PageHeader title="QR poster" />
        <Notice tone="warning">Your QR poster is ready once your charity is approved and listed.</Notice>
        <Link href={`/charity-admin/${id}`} className={secondaryAction}>Back to your overview</Link>
      </div>
    );
  }
  return <PosterView name={charity.name_en} slug={charity.slug} issues18a={canIssue18a(charity)} sp={sp} backHref={`/charity-admin/${id}`} />;
}
