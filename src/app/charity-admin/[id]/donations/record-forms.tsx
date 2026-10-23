"use client";

import { startTransition, useActionState, useState } from "react";
import { ActionForm, useFieldError } from "@/components/forms/action-form";
import { DateField, SelectField, TextField } from "@/components/forms/fields";
import { RECORDED_METHODS, MAX_IMPORT_BYTES } from "@/lib/charity/recorded-gifts";
import type { FormState } from "@/lib/form";
import { formatRand } from "@/lib/money";
import type { ImportPreview } from "./record-actions";

const methods = Object.entries(RECORDED_METHODS).map(([value, label]) => ({ value, label }));

/** One gift typed in: when, how much, how it came in, who gave it, and their s18A details if they want a receipt. */
export function RecordGiftForm({
  action,
  today,
  campaigns,
  canReceipt,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  today: string;
  campaigns: { value: string; label: string }[];
  canReceipt: boolean;
}) {
  const [donorType, setDonorType] = useState("individual");
  const [wants, setWants] = useState(false);
  return (
    <ActionForm action={action} submitLabel="Record this gift" pendingLabel="Recording…">
      <fieldset className="space-y-3">
        <legend className="font-semibold text-navy">The gift</legend>
        <DateField name="date" label="Date it came in" required defaultValue={today} />
        <TextField name="amount" label="Amount (R)" required inputMode="decimal" hint="For example 1250 or 1250.00" maxLength={20} />
        <SelectField name="method" label="How it came in" required options={methods} defaultValue="eft" />
        {campaigns.length ? <SelectField name="campaign_id" label="Campaign" options={[{ value: "", label: "No campaign" }, ...campaigns]} defaultValue="" /> : null}
        <TextField name="reference" label="Reference" hint="The bank reference or your own. It stops the same gift being recorded twice." maxLength={100} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold text-navy">Who gave it</legend>
        <div className="space-y-1">
          <label htmlFor="donor_type" className="block text-sm font-medium">Donor</label>
          <select id="donor_type" name="donor_type" value={donorType} onChange={(e) => setDonorType(e.currentTarget.value)} className="w-full rounded-control border border-border bg-surface px-3 py-2.5">
            <option value="individual">A person</option>
            <option value="company">A company</option>
            <option value="trust">A trust</option>
          </select>
        </div>
        {donorType === "individual" ? (
          <>
            <TextField name="first_name" label="First name" required maxLength={80} />
            <TextField name="last_name" label="Surname" required maxLength={80} />
          </>
        ) : (
          <>
            <TextField name="organisation_name" label="Registered name" required maxLength={200} />
            <TextField name="registration_number" label="Registration number" required={wants} maxLength={40} />
          </>
        )}
        <TextField name="email" label="Email" type="email" required hint="Their s18A receipt is emailed here." maxLength={254} />
        <TextField name="phone" label="Phone" type="tel" maxLength={20} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="font-semibold text-navy">s18A receipt</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="wants_18a" checked={wants} onChange={(e) => setWants(e.currentTarget.checked)} className="mt-1" />
          <span>They want an s18A receipt for this gift. It goes on their one receipt for the tax year, with their other gifts to you.</span>
        </label>
        {wants && !canReceipt ? (
          <p className="rounded-card bg-warning-soft p-3 text-sm text-warning">Your charity can&apos;t issue s18A receipts through Givezy yet (it needs confirmed s18A approval and a signed receipting mandate). The gift is kept with this choice for when it can.</p>
        ) : null}
        {wants ? (
          <>
            {donorType === "individual" ? (
              <>
                <TextField name="id_number" label="SA ID number" inputMode="numeric" hint="Or the income tax number below." maxLength={20} />
                <TextField name="tax_reference" label="Income tax number" inputMode="numeric" maxLength={20} />
              </>
            ) : null}
            <TextField name="address_line1" label="Street address" required maxLength={200} />
            <TextField name="address_line2" label="Address line 2" maxLength={200} />
            <TextField name="suburb" label="Suburb" maxLength={80} />
            <TextField name="city" label="City or town" required maxLength={80} />
            <TextField name="postal_code" label="Postal code" required inputMode="numeric" maxLength={4} />
          </>
        ) : null}
      </fieldset>
    </ActionForm>
  );
}

/**
 * Import a CSV file: choose it, check it (nothing is written), see what would be recorded and what is wrong,
 * then confirm and import. The file never leaves the browser until "Check the file".
 */
export function ImportGiftsForm({
  check,
  importAction,
}: {
  check: (s: ImportPreview, f: FormData) => Promise<ImportPreview>;
  importAction: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [method, setMethod] = useState("eft");
  const [readError, setReadError] = useState<string | null>(null);
  const safeCheck = async (prev: ImportPreview, f: FormData): Promise<ImportPreview> => {
    try {
      return await check(prev, f);
    } catch {
      return { state: "refused", message: typeof navigator !== "undefined" && !navigator.onLine ? "You're offline, so the file wasn't checked. Your file is still chosen: try again when you're back online." : "We couldn't reach Givezy to check the file. Nothing was imported. Please try again in a moment." };
    }
  };
  const [preview, runCheck, checking] = useActionState(safeCheck, { state: "idle" } as ImportPreview);

  const choose = (file: File | undefined) => {
    setReadError(null);
    setText("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setReadError("This file is over 1 MB. Split it into smaller files and import them one at a time.");
    if (!/\.(csv|txt)$/i.test(file.name)) return setReadError("Choose a CSV file. In Excel: File, Save as, CSV (comma delimited).");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.onerror = () => setReadError("We couldn't read this file. Save it again as CSV and choose it again.");
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData();
          f.set("text", text);
          f.set("method", method);
          startTransition(() => runCheck(f));
        }}
      >
        <div className="space-y-1">
          <label htmlFor="file" className="block text-sm font-medium">CSV file</label>
          <input id="file" type="file" accept=".csv,text/csv,.txt" onChange={(e) => choose(e.currentTarget.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-indigo" />
          {readError ? <p role="alert" className="text-sm text-danger">{readError}</p> : null}
        </div>
        <div className="space-y-1">
          <label htmlFor="method" className="block text-sm font-medium">How these gifts came in</label>
          <select id="method" value={method} onChange={(e) => setMethod(e.currentTarget.value)} className="w-full rounded-control border border-border bg-surface px-3 py-2.5">
            {methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <p className="text-xs text-muted">Used where a row has no Method column of its own.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={!text || checking} className="pressable rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60">
            {checking ? "Checking…" : "Check the file"}
          </button>
          {checking ? <p role="status" className="text-sm text-muted">Checking, please wait… Nothing is recorded yet.</p> : null}
        </div>
      </form>

      {preview.state === "refused" ? <p role="alert" className="rounded-card bg-danger-soft p-3 text-sm text-danger">{preview.message}</p> : null}

      {preview.state === "checked" ? (
        <section aria-label="What would be recorded" className="space-y-3 rounded-card border border-border bg-surface p-4 text-sm">
          <p className="font-semibold text-navy">
            {preview.good ? `${preview.good} ${preview.good === 1 ? "gift" : "gifts"} ready to record, ${formatRand(preview.totalCents)} in all.` : "No gift in this file can be recorded yet."}
            {preview.bad ? ` ${preview.bad} ${preview.bad === 1 ? "row needs" : "rows need"} fixing and will be left out.` : ""}
          </p>
          {preview.warnings.map((w, i) => <p key={i} className="rounded-card bg-warning-soft p-3 text-warning">{w}</p>)}
          {preview.unknownColumns.length ? <p className="text-muted">Columns we didn&apos;t use: {preview.unknownColumns.join(", ")}.</p> : null}
          {preview.problems.length ? (
            <details open={preview.good === 0}>
              <summary className="cursor-pointer text-brand">Rows to fix ({preview.bad})</summary>
              <ul className="mt-2 space-y-1">
                {preview.problems.map((p) => (
                  <li key={p.line}><span className="font-medium">Row {p.line}:</span> {p.messages.map((m) => m.replace(/\.$/, "")).join(". ")}.</li>
                ))}
              </ul>
              {preview.bad > preview.problems.length ? <p className="mt-1 text-muted">And {preview.bad - preview.problems.length} more.</p> : null}
            </details>
          ) : null}
          {preview.good ? (
            <ActionForm action={importAction} submitLabel={`Import ${preview.good} ${preview.good === 1 ? "gift" : "gifts"}`} pendingLabel="Importing…">
              <input type="hidden" name="text" value={text} />
              <input type="hidden" name="fingerprint" value={preview.fingerprint} />
              <input type="hidden" name="method" value={method} />
              <input type="hidden" name="file_name" value={fileName} />
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirm" className="mt-1" />
                <span>
                  These gifts came in to our charity. Our donors gave us these details, and we may share them with Givezy to record the gifts and issue their s18A receipts.
                  We won&apos;t issue our own s18A receipt for these gifts.
                </span>
              </label>
              <ConfirmError />
            </ActionForm>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ConfirmError() {
  const error = useFieldError("confirm");
  return error ? <p role="alert" className="text-xs text-danger">{error}</p> : null;
}

/** Remove one recorded gift, or a whole import. Asked first on the page: it can't be undone. */
export function RemoveImportForm({ action, gifts }: { action: (s: FormState, f: FormData) => Promise<FormState>; gifts: number }) {
  return (
    <ActionForm
      action={action}
      submitLabel={gifts === 1 ? "Remove this gift" : `Remove these ${gifts} gifts`}
      pendingLabel="Removing…"
      confirm={`Remove ${gifts === 1 ? "this gift" : `all ${gifts} gifts from this file`}? ${gifts === 1 ? "It" : "They"} will no longer count in your totals or on any s18A receipt. This can't be undone, but you can record or import ${gifts === 1 ? "it" : "them"} again.`}
      confirmLabel="Yes, remove"
    />
  );
}
