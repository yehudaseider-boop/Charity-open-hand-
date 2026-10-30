"use client";

import { useId, useState } from "react";
import { useFieldError } from "./action-form";
import { showDay } from "@/lib/typed-date";

/** A page-unique id, so two forms with the same field name never share a label. */
export function useFieldId(name: string) {
  return `${name}-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
}

// The style guide's field: a soft border, a blue border and ring when focused, red when it has a problem.
const inputClass =
  "w-full rounded-[0.875rem] border-2 border-border bg-surface px-3.5 py-2.5 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft aria-invalid:border-danger";

type Base = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
};

function Wrapper({ id, name, label, hint, required, children }: Base & { id: string; children: React.ReactNode }) {
  const error = useFieldError(name);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required ? null : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <ErrorMark />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  defaultValue,
  type = "text",
  autoDirection,
  inputMode,
  autoComplete,
  maxLength,
  ...base
}: Base & {
  defaultValue?: string | null;
  type?: "text" | "email" | "tel" | "url";
  /** The box follows the direction of what is typed (left to right or right to left). */
  autoDirection?: boolean;
  inputMode?: "numeric" | "decimal" | "tel" | "email" | "url";
  autoComplete?: string;
  /** Stops typing past what the server accepts. */
  maxLength?: number;
}) {
  const error = useFieldError(base.name);
  const id = useFieldId(base.name);
  return (
    <Wrapper {...base} id={id}>
      <input
        id={id}
        name={base.name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : base.hint ? `${id}-hint` : undefined}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        {...(autoDirection ? { dir: "auto" } : {})}
        className={inputClass}
      />
    </Wrapper>
  );
}

/**
 * A date typed as dd/mm/yyyy. Not the browser's date picker: that shows mm/dd/yyyy on a phone or browser set
 * to US English, which turns 05/03 into 3 May. The server reads it with typedDay (src/lib/typed-date.ts).
 */
export function DateField({ defaultValue, hint, ...base }: Base & { defaultValue?: string | null }) {
  return (
    <TextField
      {...base}
      defaultValue={showDay(defaultValue)}
      autoComplete="off"
      maxLength={10}
      hint={hint ? `${hint} Write it as dd/mm/yyyy.` : "Write it as dd/mm/yyyy, for example 31/12/2026."}
    />
  );
}

export function TextArea({
  defaultValue,
  rows = 5,
  maxLength,
  ...base
}: Base & { defaultValue?: string | null; rows?: number; maxLength?: number }) {
  const error = useFieldError(base.name);
  const id = useFieldId(base.name);
  return (
    <Wrapper {...base} id={id}>
      <textarea
        id={id}
        name={base.name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : base.hint ? `${id}-hint` : undefined}
        className={inputClass}
      />
    </Wrapper>
  );
}

export function SelectField({
  options,
  defaultValue,
  ...base
}: Base & { options: readonly { value: string; label: string }[]; defaultValue?: string | null }) {
  const error = useFieldError(base.name);
  const id = useFieldId(base.name);
  return (
    <Wrapper {...base} id={id}>
      <select
        id={id}
        name={base.name}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : base.hint ? `${id}-hint` : undefined}
        className={inputClass}
      >
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

/** Files over this are refused on the phone or laptop, before uploading (the server says the same). */
export const MAX_FILE_MB = 5;

export function FileField({ accept, ...base }: Base & { accept: string }) {
  const serverError = useFieldError(base.name);
  const id = useFieldId(base.name);
  // Checked as soon as a file is chosen: a too-big file never leaves the device, and nothing typed is lost.
  const [tooBig, setTooBig] = useState<string | null>(null);
  const error = tooBig ?? serverError;
  return (
    <Wrapper {...base} id={id}>
      <input
        id={id}
        name={base.name}
        type="file"
        accept={accept}
        required={base.required}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
            setTooBig(`This file is ${(f.size / 1024 / 1024).toFixed(1)} MB. Files must be ${MAX_FILE_MB} MB or smaller. Choose a smaller one.`);
            e.currentTarget.value = "";
          } else setTooBig(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : base.hint ? `${id}-hint` : undefined}
        className="block w-full text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-indigo"
      />
      {tooBig ? <p id={`${id}-error`} role="alert" className="text-sm text-danger">{tooBig}</p> : null}
    </Wrapper>
  );
}

export function CheckboxGroup({
  name,
  label,
  options,
  defaultValues,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; labelHe?: string | null }[];
  defaultValues: string[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-soft"
          >
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The small warning mark beside a field's error, so an error is not shown by colour alone. */
export function ErrorMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 stroke-current">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </svg>
  );
}
