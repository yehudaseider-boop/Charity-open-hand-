import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { requireViewer } from "@/lib/auth";
import { loadCharityForManager } from "@/lib/charity/queries";
import { listImports } from "@/lib/charity/recorded-gifts-store";
import { formatDate } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { checkImport, importGifts, removeRecordedGifts } from "../record-actions";
import { ImportGiftsForm, RemoveImportForm } from "../record-forms";

export const metadata: Metadata = { title: "Import gifts" };

/** Past gifts from a spreadsheet (a bank export, another giving programme): checked first, then recorded. */
export default async function ImportGiftsPage({ params }: PageProps<"/charity-admin/[id]/donations/import">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donations/import`);
  await loadCharityForManager(id);
  const imports = await listImports(id);
  return (
    <div className="space-y-4">
      <Link href={`/charity-admin/${id}/donations`} className="text-sm text-muted">← Donations</Link>
      <div>
        <h1 className="font-display text-2xl text-indigo">Import gifts from a file</h1>
        <p className="text-sm text-muted">
          For gifts that reached you another way, for example from a bank statement or another giving programme. Save your spreadsheet as CSV with one gift per row.
          We check every row first and show you what would be recorded. Nothing is saved until you press Import.
        </p>
      </div>
      <Card title="What the file needs">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li><span className="font-medium">Date</span> (dd/mm/yyyy), <span className="font-medium">Amount</span> (1250 or 1250.00) and <span className="font-medium">Email</span> on every row.</li>
          <li>The donor&apos;s first name and surname, or the organisation&apos;s name.</li>
          <li>For an s18A receipt: <span className="font-medium">s18A</span> set to yes, their SA ID or income tax number, and their address.</li>
          <li>Optional: method, campaign (its exact title), phone, and a reference (the bank reference stops the same gift being imported twice).</li>
        </ul>
        <a href={`/charity-admin/${id}/donations/import/template`} className="mt-3 inline-block text-sm text-brand underline">Download the template (CSV)</a>
      </Card>
      <ImportGiftsForm check={checkImport.bind(null, id)} importAction={importGifts.bind(null, id)} />
      {imports.length ? (
        <Card title="Earlier imports">
          <ul className="divide-y divide-border text-sm">
            {imports.map((im) => (
              <li key={im.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{im.file_name}</p>
                  <p className="text-muted">{formatDate(im.created_at)}: {im.gifts} {im.gifts === 1 ? "gift" : "gifts"}, {formatRand(im.total_cents)}</p>
                </div>
                <RemoveImportForm action={removeRecordedGifts.bind(null, id, { importId: im.id })} gifts={im.gifts} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
