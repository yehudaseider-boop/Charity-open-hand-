"use client";

/** Form controls for the portal. Every control has a visible label and a 44px touch target. */
import { useId, type ComponentProps, type ReactNode } from "react";
import { Icon } from "./icons";
import { cx } from "./primitives";

const CONTROL = "w-full min-h-11 rounded-2xl border border-gz-hairline bg-gz-surface px-3.5 text-[15px] text-gz-ink placeholder:text-gz-muted/70 transition-colors hover:border-gz-blue/30 focus:border-gz-blue focus:outline-none focus:ring-2 focus:ring-gz-blue/15 disabled:bg-gz-neutral-soft disabled:text-gz-muted";

export function Field({ label, hint, error, children, htmlFor, optional }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-semibold text-gz-ink">
        {label}
        {optional && <span className="text-xs font-normal text-gz-muted">Optional</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-sm text-gz-danger" role="alert">
          <Icon name="alert" size={14} />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-gz-muted">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({ label, hint, error, optional, className, prefix, ...rest }: ComponentProps<"input"> & { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; prefix?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} optional={optional}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[15px] font-semibold text-gz-muted">{prefix}</span>}
        <input id={id} aria-invalid={!!error} className={cx(CONTROL, prefix && "pl-8", error && "border-gz-danger", className)} {...rest} />
      </div>
    </Field>
  );
}

export function TextArea({ label, hint, error, optional, className, ...rest }: ComponentProps<"textarea"> & { label: string; hint?: ReactNode; error?: string | null; optional?: boolean }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} optional={optional}>
      <textarea id={id} aria-invalid={!!error} className={cx(CONTROL, "min-h-24 py-2.5", error && "border-gz-danger", className)} {...rest} />
    </Field>
  );
}

export function Select({ label, hint, error, options, className, hideLabel, ...rest }: ComponentProps<"select"> & { label: string; hint?: ReactNode; error?: string | null; options: { value: string; label: string }[]; hideLabel?: boolean }) {
  const id = useId();
  const control = (
    <div className="relative">
      <select id={id} aria-label={hideLabel ? label : undefined} className={cx(CONTROL, "appearance-none pr-10", className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gz-muted" />
    </div>
  );
  if (hideLabel) return control;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      {control}
    </Field>
  );
}

/** A filter dropdown without a visible label (the label is read by screen readers). */
export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <Select label={label} hideLabel value={value} onChange={(e) => onChange(e.target.value)} options={options} className="min-w-40 rounded-full text-sm font-medium" />;
}

export function Toggle({ label, description, checked, onChange, disabled }: { label: string; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[15px] font-semibold text-gz-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-gz-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-gz-blue" : "bg-gz-hairline")}
      >
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label = "Search" }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gz-muted" />
      <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(CONTROL, "rounded-full pl-10 text-sm")} />
    </div>
  );
}
