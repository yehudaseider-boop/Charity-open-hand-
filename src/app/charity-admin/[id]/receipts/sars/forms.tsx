"use client";

import { useState } from "react";
import { ActionForm, useFieldError } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import { blueAction, primaryAction } from "@/components/dash";
import type { FormState } from "@/lib/form";
import { LEGAL_FORMS, SOURCE_IDENTIFIER_LENGTH } from "@/lib/receipts/it3d";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function SarsDetailsForm({ action, values }: { action: Action; values: { tax: string | null; form: string | null; reg: string | null } }) {
  const [form, setForm] = useState(values.form ?? "");
  return (
    <ActionForm action={action} submitLabel="Save SARS details">
      <TextField name="tax_reference_number" label="Income tax reference number" inputMode="numeric" maxLength={12} defaultValue={values.tax}
        hint="Your charity's own 10-digit number from SARS, as on its SARS letters." />
      <LegalForm value={form} onChange={setForm} />
      <TextField name="registration_number" label="Registration number" maxLength={30} defaultValue={values.reg}
        hint={form === "INTERVIVOS_TRUST" ? "The trust number from the Master of the High Court, for example IT1234/2015." : "The CIPC number for a non-profit company, for example 2015/123456/08."} />
    </ActionForm>
  );
}

function LegalForm({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const error = useFieldError("legal_form");
  return (
    <fieldset className="space-y-2" aria-describedby={error ? "legal_form-error" : "legal_form-hint"}>
      <legend className="text-sm font-semibold">Legal form <span className="font-normal text-muted">(as SARS has you registered)</span></legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {LEGAL_FORMS.map((f) => (
          <label key={f.code} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border-2 border-border px-3 py-2 text-sm has-checked:border-brand has-checked:bg-honey-soft">
            <input type="radio" name="legal_form" value={f.code} checked={value === f.code} onChange={() => onChange(f.code)} />
            <span>{f.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id="legal_form-error" role="alert" className="text-xs font-medium text-danger">{error}</p>
      ) : (
        <p id="legal_form-hint" className="text-xs text-muted">Not sure? Ask your accountant which one SARS has you registered as.</p>
      )}
    </fieldset>
  );
}

type Status = { kind: "idle" } | { kind: "working" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/** Fetch a file and save it, saying on the page what is happening and, if it fails, why and what to do. */
async function download(url: string, init: RequestInit, done: (name: string) => string): Promise<Status> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "error", message: "You're offline, so nothing was downloaded. What you typed is still here. Check your connection and try again." };
  }
  try {
    const res = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
    if (!res.ok) {
      const plain = (res.headers.get("Content-Type") ?? "").startsWith("text/plain");
      return { kind: "error", message: plain ? await res.text() : "That download didn't work, and nothing was downloaded. Reload the page and try again." };
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return { kind: "done", message: done(name) };
  } catch {
    return { kind: "error", message: "We couldn't reach Givezy, so nothing was downloaded. What you typed is still here. Please try again in a moment." };
  }
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === "idle") return <p role="status" className="sr-only" />;
  const cls = status.kind === "error" ? "bg-danger-soft text-danger" : status.kind === "done" ? "bg-success-soft text-success" : "bg-brand-soft text-indigo";
  return (
    <p role="status" aria-live="polite" className={`rounded-control p-3 text-sm ${cls}`}>
      {status.kind === "working" ? "Preparing your file…" : status.message}
    </p>
  );
}

export function SheetDownload({ url }: { url: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  return (
    <div className="space-y-2">
      <button type="button" className={primaryAction} disabled={status.kind === "working"}
        onClick={async () => {
          setStatus({ kind: "working" });
          setStatus(await download(url, { method: "GET" }, (n) => `Downloaded ${n}. It holds donors' full ID numbers: keep it safe and delete it once you've submitted.`));
        }}>
        {status.kind === "working" ? "Preparing…" : "eFiling capture sheet (.xlsx)"}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

export function FileDownload({ url, year, period, ready, notReady }: { url: string; year: number; period: string; ready: boolean; notReady: string | null }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [source, setSource] = useState("");
  const length = [...source.trim()].length;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        data.set("year", String(year));
        data.set("period", period);
        setStatus({ kind: "working" });
        setStatus(await download(url, { method: "POST", body: data }, (n) => `Downloaded ${n}. It holds donors' full ID numbers: keep it safe. Check it with your accountant before it is sent to SARS.`));
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Which SARS system is it for?</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="test_data" value="L" defaultChecked /> Live file
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="radio" name="test_data" value="T" /> Test file for the SARS test environment
        </label>
      </fieldset>
      <div className="space-y-1">
        <label htmlFor="source_identifier" className="block text-sm font-semibold">Source Identifier</label>
        <textarea id="source_identifier" name="source_identifier" rows={3} value={source} onChange={(e) => setSource(e.target.value)}
          autoComplete="off" spellCheck={false} aria-describedby="source_identifier-hint"
          className="w-full rounded-control border-2 border-border bg-surface px-3 py-2 font-mono text-xs text-navy [overflow-wrap:anywhere] focus:border-brand" />
        <p id="source_identifier-hint" className="text-xs text-muted">
          The {SOURCE_IDENTIFIER_LENGTH}-character code SARS gives your submitter when they enrol for third-party data on HTTPS (SARS publishes a separate one for its test environment).
          Used for this file only: Givezy never keeps it. <span className="tabular-nums">{length} of {SOURCE_IDENTIFIER_LENGTH} characters.</span>
        </p>
      </div>
      {!ready && notReady ? <p className="text-sm text-muted">{notReady}</p> : null}
      <button type="submit" className={`${blueAction} disabled:cursor-not-allowed disabled:opacity-60`} disabled={!ready || status.kind === "working"}>
        {status.kind === "working" ? "Preparing…" : "SARS data file (.psv)"}
      </button>
      <StatusLine status={status} />
    </form>
  );
}
