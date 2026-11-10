"use client";

import { startTransition, useActionState, useState } from "react";
import { ActionForm, useFieldError } from "@/components/forms/action-form";
import { MAX_IMPORT_BYTES } from "@/lib/charity/contacts";
import type { FormState } from "@/lib/form";
import type { ContactPreview } from "./contact-actions";
import { blueAction } from "@/components/dash";

/**
 * Import a charity's own donor list: choose the file, check it (nothing is written), see each row's problems,
 * then confirm and import. All or nothing: Import is offered only when every row passes.
 */
export function ImportContactsForm({
  check,
  importAction,
}: {
  check: (s: ContactPreview, f: FormData) => Promise<ContactPreview>;
  importAction: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const safeCheck = async (prev: ContactPreview, f: FormData): Promise<ContactPreview> => {
    try {
      return await check(prev, f);
    } catch {
      return { state: "refused", message: typeof navigator !== "undefined" && !navigator.onLine ? "You're offline, so the file wasn't checked. Your file is still chosen: try again when you're back online." : "We couldn't reach Givezy to check the file. Nothing was imported. Please try again in a moment." };
    }
  };
  const [preview, runCheck, checking] = useActionState(safeCheck, { state: "idle" } as ContactPreview);

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
          startTransition(() => runCheck(f));
        }}
      >
        <div className="space-y-1">
          <label htmlFor="file" className="block text-sm font-semibold">CSV file</label>
          <input id="file" type="file" accept=".csv,text/csv,.txt" onChange={(e) => choose(e.currentTarget.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-indigo" />
          {readError ? <p role="alert" className="text-sm text-danger">{readError}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={!text || checking} className={`${blueAction} disabled:opacity-60`}>
            {checking ? "Checking…" : "Check the file"}
          </button>
          {checking ? <p role="status" className="text-sm text-muted">Checking, please wait… Nothing is imported yet.</p> : null}
        </div>
      </form>

      {preview.state === "refused" ? <p role="alert" className="rounded-card bg-danger-soft p-3 text-sm text-danger">{preview.message}</p> : null}

      {preview.state === "checked" ? (
        <section aria-label="What would be imported" className="space-y-3 rounded-card border-2 border-border bg-honey-soft/40 p-4 text-sm sm:p-5">
          <p className="font-display text-lg font-bold text-indigo">
            {preview.bad
              ? `${preview.bad} of ${preview.good + preview.bad} ${preview.good + preview.bad === 1 ? "row needs" : "rows need"} fixing. Nothing will be imported until every row is right.`
              : `${preview.good} ${preview.good === 1 ? "donor" : "donors"} ready to import.`}
          </p>
          {!preview.bad && preview.good ? (
            <p className="text-muted">
              {preview.withPhone} with a phone number, {preview.withAddress} with an address. Rows without them are imported as they are.
            </p>
          ) : null}
          {preview.warnings.map((w, i) => <p key={i} className="rounded-card bg-warning-soft p-3 text-warning">{w}</p>)}
          {preview.unknownColumns.length ? <p className="text-muted [overflow-wrap:anywhere]">Columns we didn&apos;t use: {preview.unknownColumns.join(", ")}.</p> : null}
          {preview.newTags.length ? <p className="text-muted [overflow-wrap:anywhere]">New tags this adds: {preview.newTags.join(", ")}.</p> : null}
          {preview.problems.length ? (
            <div>
              <p className="font-semibold text-indigo">Rows to fix</p>
              <ul className="mt-2 space-y-1">
                {preview.problems.map((p) => (
                  <li key={p.line} className="[overflow-wrap:anywhere]"><span className="font-medium">Row {p.line}:</span> {p.messages.map((m) => m.replace(/\.$/, "")).join(". ")}.</li>
                ))}
              </ul>
              {preview.bad > preview.problems.length ? <p className="mt-1 text-muted">And {preview.bad - preview.problems.length} more.</p> : null}
              <p className="mt-2 text-muted">Fix these in your spreadsheet, save it as CSV again, then choose it and press Check the file.</p>
            </div>
          ) : null}
          {preview.canImport ? (
            <ActionForm action={importAction} submitLabel={`Import ${preview.good} ${preview.good === 1 ? "donor" : "donors"}`} pendingLabel="Importing…">
              <input type="hidden" name="text" value={text} />
              <input type="hidden" name="fingerprint" value={preview.fingerprint} />
              <input type="hidden" name="file_name" value={fileName} />
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirm" className="mt-1" />
                <span>These people gave our charity their details themselves, and we may keep them on our list in Givezy. Givezy won&apos;t email them.</span>
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

/** Remove a whole import once Undo has run out. Asked first: it can't be taken back. */
export function RemoveContactsForm({ action, contacts }: { action: (s: FormState, f: FormData) => Promise<FormState>; contacts: number }) {
  return (
    <ActionForm
      action={action}
      submitLabel={contacts === 1 ? "Remove this donor" : `Remove these ${contacts} donors`}
      pendingLabel="Removing…"
      confirm={`Remove ${contacts === 1 ? "this imported donor" : `all ${contacts} imported donors from this file`} from your list, with their note and tags? This can't be undone, but you can import the file again.`}
      confirmLabel="Yes, remove"
    />
  );
}
