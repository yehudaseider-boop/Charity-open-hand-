import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice } from "@/components/card";
import { ActionLink, PageHeader } from "@/components/dash";
import { requireViewer } from "@/lib/auth";
import { listContactImports } from "@/lib/charity/contacts-store";
import { loadCharityForManager } from "@/lib/charity/queries";
import { isOwner } from "@/lib/charity/team";
import { formatDate } from "@/lib/dates";
import { checkContactImport, importContacts, removeContacts } from "../contact-actions";
import { ImportContactsForm, RemoveContactsForm } from "../contact-forms";

export const metadata: Metadata = { title: "Import donors" };

/** A charity's own donor list from a spreadsheet: people who haven't given through Givezy yet. Checked first, then imported. */
export default async function ImportDonorsPage({ params }: PageProps<"/charity-admin/[id]/donors/import">) {
  const { id } = await params;
  await requireViewer(`/charity-admin/${id}/donors/import`);
  const { charity } = await loadCharityForManager(id);
  const [owner, imports] = await Promise.all([isOwner(id), listContactImports(id)]);
  return (
    <div className="space-y-5">
      <PageHeader
        back={<Link href={`/charity-admin/${id}/donors`} className="text-muted hover:text-brand">← Donors</Link>}
        title="Import donors from a file"
        intro={
          <>
            For the donor list you already keep, before those people give through Givezy. Save your spreadsheet as CSV with one person per row.
            We check every row first and show you what would be imported. Nothing is saved until you press Import, and if any row has a problem, nothing is imported.
          </>
        }
      />
      <p className="rounded-card border-2 border-border bg-brand-soft p-3 text-sm font-medium text-navy">Givezy never emails the people you import: they aren&apos;t sent appeals, thank-yous or anything else from Givezy.</p>
      <Card title="What the file needs">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>A <span className="font-medium">First name</span> and <span className="font-medium">Surname</span>, or an <span className="font-medium">Organisation</span>, on every row.</li>
          <li>Optional: an <span className="font-medium">Email</span>. Each email only once.</li>
          <li>
            Optional: a <span className="font-medium">Phone</span> number. A South African number, written 082 123 4567 or +27 82 123 4567.
            Spaces, brackets and dashes are fine.
          </li>
          <li>
            Optional: a postal address, in the columns <span className="font-medium">Address</span>, <span className="font-medium">Address line 2</span>,{" "}
            <span className="font-medium">Suburb</span>, <span className="font-medium">City</span> and <span className="font-medium">Postal code</span> (4 digits). Fill in as many as you have.
          </li>
          <li>Optional: a <span className="font-medium">Note</span>, and <span className="font-medium">Tags</span> separated by semicolons, for example Volunteer; Newsletter. New tags are added to your tags.</li>
          <li>Up to 1 000 people and 1 MB per file.</li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          Spreadsheets drop the 0 at the front of a phone number or postal code (082 123 4567 becomes 821234567, and 0157 becomes 157). Set those two columns
          to Text before you save, or we&apos;ll point out the rows to fix.
        </p>
        <p className="mt-2 text-sm text-muted">
          Leave ID and tax numbers out. Givezy only needs one for an s18A receipt, and the donor gives it with their gift, so a column of them isn&apos;t imported or kept.
        </p>
        <div className="mt-4">
          <ActionLink href={`/charity-admin/${id}/donors/import/template`} download>Download the template (CSV)</ActionLink>
        </div>
      </Card>
      {charity.status !== "approved" ? (
        <Notice tone="warning">You can import donors once Givezy has approved your charity.</Notice>
      ) : !owner ? (
        <Notice>Only your charity&apos;s owner can import donors.</Notice>
      ) : (
        <Card title="Check and import">
          <ImportContactsForm check={checkContactImport.bind(null, id)} importAction={importContacts.bind(null, id)} />
        </Card>
      )}
      {imports.length ? (
        <Card title="Earlier imports">
          <ul className="divide-y divide-border text-sm">
            {imports.map((im) => (
              <li key={im.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-semibold text-indigo [overflow-wrap:anywhere]">{im.file_name}</p>
                  <p className="text-muted">{formatDate(im.created_at)}: {im.contacts} {im.contacts === 1 ? "donor" : "donors"}</p>
                </div>
                {owner ? <RemoveContactsForm action={removeContacts.bind(null, id, im.id)} contacts={im.contacts} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
