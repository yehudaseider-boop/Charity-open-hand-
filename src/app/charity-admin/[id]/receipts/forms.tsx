"use client";

import { ActionForm } from "@/components/forms/action-form";
import { TextArea, TextField } from "@/components/forms/fields";
import type { FormState } from "@/lib/form";

type Action = (s: FormState, f: FormData) => Promise<FormState>;
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

/**
 * "Approve all": every certificate still to check is approved, and the list goes to Givezy. Declined ones stay
 * out. When every one has been approved one by one, the same button sends the list.
 */
export function ApproveReceiptsForm({ action, count, total, toCheck, declined }: { action: Action; count: number; total: string; toCheck: number; declined: number }) {
  const out = declined ? ` ${many(declined, "declined receipt")} ${declined === 1 ? "stays" : "stay"} out.` : "";
  return (
    <ActionForm
      action={action}
      submitLabel={toCheck ? "Approve all" : `Send ${many(count, "approved receipt")} to Givezy`}
      pendingLabel="Approving…"
      confirm={
        toCheck
          ? `Approve all ${many(count, "s18A receipt")}, ${total} in all? This approves the ${many(toCheck, "receipt")} still to check as well.${out} Givezy checks the list and signs it off before anything is issued. Until then you can take your approval back.`
          : `Send ${many(count, "approved s18A receipt")}, ${total} in all, to Givezy?${out} Givezy checks the list and signs it off before anything is issued. Until then you can take your approval back.`
      }
      confirmLabel={toCheck ? "Yes, approve all" : "Yes, send it"}
    />
  );
}

export function WithdrawReceiptsForm({ action }: { action: Action }) {
  return <ActionForm action={action} submitLabel="Take back my approval" pendingLabel="Taking it back…" />;
}

/** Approve one receipt. It can be taken back for 30 minutes (Undo), or reopened until the list goes to Givezy. */
export function ApproveCertificateForm({ action }: { action: Action }) {
  return <ActionForm action={action} submitLabel="Approve this receipt" pendingLabel="Approving…" />;
}

/**
 * Decline one receipt and email the donor to contact the charity. The email can't be taken back, so the page
 * asks first and says exactly what will be sent where.
 */
export function DeclineCertificateForm({ action, donorName, phone, email, again = false }: { action: Action; donorName: string; phone: string; email: string; again?: boolean }) {
  return (
    <ActionForm
      action={action}
      submitLabel={again ? "Send the email again" : "Decline and email the donor"}
      pendingLabel={again ? "Sending…" : "Declining…"}
      confirm={
        again
          ? `Email ${donorName} again, asking them to contact you on ${phone} or ${email}? An email can't be taken back once it has gone.`
          : `Decline this s18A receipt and email ${donorName}? We'll ask them to contact you on ${phone} or ${email}, and leave the receipt out of your list. The email can't be taken back once it has gone. You can reopen the receipt until Givezy signs off your list.`
      }
      confirmLabel={again ? "Yes, send it" : "Yes, decline and email"}
    >
      {again ? null : (
        <TextArea
          name="note"
          label="A note for your records"
          hint="Only your charity sees it. It's not sent to the donor."
          rows={2}
          maxLength={300}
        />
      )}
    </ActionForm>
  );
}

/** Back to "To check". For a declined receipt nothing is emailed. */
export function ReopenCertificateForm({ action }: { action: Action }) {
  return <ActionForm action={action} submitLabel="Back to To check" pendingLabel="Reopening…" />;
}

type Details = Record<"first_name" | "last_name" | "organisation_name" | "address_line1" | "address_line2" | "suburb" | "city" | "postal_code", string | null>;

/**
 * Correct the donor's name and street address on this receipt, then approve it. Only these fields: amounts,
 * dates, the gifts, ID and tax numbers are never on this form, and the server writes only these columns.
 */
export function EditCertificateForm({ action, person, current }: { action: Action; person: boolean; current: Details }) {
  return (
    <ActionForm action={action} submitLabel="Save and approve" pendingLabel="Saving…">
      {person ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="first_name" label="First name" required autoDirection autoComplete="off" maxLength={80} defaultValue={current.first_name} />
          <TextField name="last_name" label="Surname" required autoDirection autoComplete="off" maxLength={80} defaultValue={current.last_name} />
        </div>
      ) : (
        <TextField name="organisation_name" label="Registered name" required autoDirection autoComplete="off" maxLength={200} defaultValue={current.organisation_name} />
      )}
      <TextField name="address_line1" label="Street address" required autoDirection autoComplete="off" maxLength={200} defaultValue={current.address_line1} />
      <TextField name="address_line2" label="Address line 2" autoDirection autoComplete="off" maxLength={200} defaultValue={current.address_line2} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField name="suburb" label="Suburb" autoDirection autoComplete="off" maxLength={80} defaultValue={current.suburb} />
        <TextField name="city" label="City or town" required autoDirection autoComplete="off" maxLength={80} defaultValue={current.city} />
        <TextField name="postal_code" label="Postal code" required inputMode="numeric" autoComplete="off" maxLength={4} defaultValue={current.postal_code} />
      </div>
    </ActionForm>
  );
}
