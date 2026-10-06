"use client";

import { useFieldError } from "./action-form";

const inputClass =
  "w-full rounded-control border border-border bg-surface px-3 py-2.5 aria-invalid:border-danger";

type Base = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
};

function Wrapper({ name, label, hint, required, children }: Base & { children: React.ReactNode }) {
  const error = useFieldError(name);
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        {required ? null : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function TextField({
  defaultValue,
  type = "text",
  hebrew,
  inputMode,
  autoComplete,
  ...base
}: Base & {
  defaultValue?: string | null;
  type?: "text" | "email" | "tel" | "url" | "date";
  /** Hebrew input: right-to-left. */
  hebrew?: boolean;
  inputMode?: "numeric" | "tel" | "email" | "url";
  autoComplete?: string;
}) {
  const error = useFieldError(base.name);
  return (
    <Wrapper {...base}>
      <input
        id={base.name}
        name={base.name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-invalid={error ? true : undefined}
        inputMode={inputMode}
        autoComplete={autoComplete}
        {...(hebrew ? { lang: "he", dir: "rtl" } : {})}
        className={inputClass}
      />
    </Wrapper>
  );
}

export function TextArea({
  defaultValue,
  hebrew,
  rows = 5,
  ...base
}: Base & { defaultValue?: string | null; hebrew?: boolean; rows?: number }) {
  const error = useFieldError(base.name);
  return (
    <Wrapper {...base}>
      <textarea
        id={base.name}
        name={base.name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-invalid={error ? true : undefined}
        {...(hebrew ? { lang: "he", dir: "rtl" } : {})}
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
  return (
    <Wrapper {...base}>
      <select
        id={base.name}
        name={base.name}
        defaultValue={defaultValue ?? ""}
        required={base.required}
        aria-invalid={error ? true : undefined}
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

export function FileField({ accept, ...base }: Base & { accept: string }) {
  const error = useFieldError(base.name);
  return (
    <Wrapper {...base}>
      <input
        id={base.name}
        name={base.name}
        type="file"
        accept={accept}
        required={base.required}
        aria-invalid={error ? true : undefined}
        className="block w-full text-sm file:mr-3 file:rounded-control file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-brand"
      />
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
