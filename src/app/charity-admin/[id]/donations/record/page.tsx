import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { canIssue18a } from "@/lib/charities";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isoDateInJhb } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOneGift } from "../record-actions";
import { RecordGiftForm } from "../record-forms";

export const metadata: Metadata = { title: "Record a gift" };

/** A gift that came in some other way (EFT, cash, a debit order), typed in so it counts with the rest. */
export default async function RecordGiftPage({ params }: PageProps<"/charity-admin/[id]/donations/record">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donations/record`);
  const { charity } = await loadCharityForManager(id);
  const { data: campaigns } = await createAdminClient().from("campaigns").select("id, title").eq("charity_id", id).order("created_at", { ascending: false });
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`/charity-admin/${id}/donations`} className="text-muted hover:text-brand">← Donations</Link>}
        title="Record a gift"
        intro={
          <>
          For a gift that reached you another way: an EFT, cash, a debit order or another giving programme. It counts in your totals and the donor&apos;s history,
          and if they want one, it goes on their yearly s18A receipt with their other gifts to you. Many gifts at once?{" "}
          <Link href={`/charity-admin/${id}/donations/import`} className="font-semibold text-brand underline">Import them from a file</Link>.
          </>
        }
      />
      <Notice>Only record money that has reached your bank account or your hands. You can remove a gift you recorded until it is on an s18A receipt.</Notice>
      <Card>
      <RecordGiftForm action={recordOneGift.bind(null, id)} today={isoDateInJhb()} campaigns={(campaigns ?? []).map((c) => ({ value: c.id as string, label: c.title as string }))} canReceipt={canIssue18a(charity)} />
      </Card>
    </div>
  );
}
