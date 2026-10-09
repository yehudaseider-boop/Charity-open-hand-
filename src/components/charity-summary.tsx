import { documentTypes, type DocumentType } from "@/lib/charity/validation";
import { formatDate, formatDateTime } from "@/lib/dates";
import { masked } from "@/lib/mask";

type Row = [label: string, value: React.ReactNode];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-0.5 py-2 sm:grid-cols-3 sm:gap-3">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words sm:col-span-2">{value || <span className="text-muted">Not provided</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OrganisationSummary({ c }: {
  c: {
    name_en: string; name_he: string | null; legal_name_en: string; legal_name_he: string | null;
    npo_number: string | null; pbo_number: string | null; s18a_reference: string | null;
    address_line1: string | null; address_line2: string | null; suburb: string | null; city: string | null; postal_code: string | null;
  };
}) {
  const address = [c.address_line1, c.address_line2, c.suburb, c.city, c.postal_code].filter(Boolean).join(", ");
  return (
    <Rows rows={[
      ["Display name", c.name_en],
      ["Legal name", c.legal_name_en],
      ["NPO number", c.npo_number],
      ["PBO reference", c.pbo_number],
      ["s18A reference", c.s18a_reference],
      ["Registered address", address],
    ]} />
  );
}

export function PrivateSummary({ p }: {
  p: {
    contact_name: string | null; contact_email: string | null; contact_phone: string | null;
    bank_name: string | null; bank_account_holder: string | null; bank_account_last4: string | null;
    bank_branch_code: string | null; bank_verified_at: string | null;
  } | null;
}) {
  return (
    <Rows rows={[
      ["Contact person", p?.contact_name],
      ["Contact email", p?.contact_email],
      ["Contact phone", p?.contact_phone],
      ["Bank", p?.bank_name],
      ["Account holder", p?.bank_account_holder],
      ["Account number", p?.bank_account_last4 ? masked(p.bank_account_last4) : null],
      ["Branch code", p?.bank_branch_code],
      ["Bank verified", p?.bank_verified_at ? formatDateTime(p.bank_verified_at) : "Not yet"],
    ]} />
  );
}

export function DocumentList({ docs, hrefFor, removeAction }: {
  docs: { id: string; document_type: DocumentType; file_name: string; signed_on: string | null; uploaded_at: string }[];
  hrefFor?: (id: string) => string | null;
  removeAction?: (id: string) => () => Promise<void>;
}) {
  if (docs.length === 0) return <p className="text-sm text-muted">No documents uploaded yet.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {docs.map((d) => {
        const href = hrefFor?.(d.id);
        return (
          <li key={d.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{documentTypes[d.document_type]}</p>
              <p className="truncate text-muted">
                {href ? <a href={href} target="_blank" rel="noreferrer" className="text-brand underline">{d.file_name}</a> : d.file_name}
              </p>
              <p className="text-xs text-muted">
                Uploaded {formatDate(d.uploaded_at)}
                {d.signed_on ? ` · signed ${formatDate(d.signed_on)}` : ""}
              </p>
            </div>
            {removeAction ? (
              <form action={removeAction(d.id)}>
                <button className="text-xs text-danger underline">Remove</button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
