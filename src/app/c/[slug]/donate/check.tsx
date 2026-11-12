"use client";

import { useState } from "react";
import { ErrorMark, useFieldId } from "@/components/forms/fields";

/**
 * A consent box. `children` is the label (clicking it ticks the box); `detail` follows it in the same
 * sentence but outside the label, so links in it can be clicked without toggling the box.
 */
export function Check({ name, children, detail, error, checked: controlled, onCheckedChange }: {
  name: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
  error?: string;
  /** Held by the page when it needs to know whether the box is ticked (the optional choices' summary). */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const checked = controlled ?? own;
  const setChecked = (v: boolean) => {
    setOwn(v);
    onCheckedChange?.(v);
  };
  const id = useFieldId(name);
  const showError = Boolean(error) && !checked;
  const describedBy = [detail ? `${id}-detail` : null, showError ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <div className="flex min-h-11 items-start gap-3 py-1 text-sm leading-relaxed">
        <input
          id={id}
          type="checkbox"
          name={name}
          className="mt-0.5"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          aria-invalid={showError || undefined}
          aria-describedby={describedBy}
        />
        <span>
          <label htmlFor={id}>{children}</label>
          {detail ? <span id={`${id}-detail`}> {detail}</span> : null}
        </span>
      </div>
      {showError ? <p id={`${id}-error`} role="alert" className="ml-[2.125rem] flex items-start gap-1.5 text-sm font-semibold text-danger"><ErrorMark /><span>{error}</span></p> : null}
    </div>
  );
}
