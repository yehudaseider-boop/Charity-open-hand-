import type { z } from "zod";

/** What every form action returns to the page. */
export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialFormState: FormState = { ok: false };

/** FormData -> plain object of trimmed strings (empty -> undefined). */
export function formToObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || k.startsWith("$")) continue;
    const t = v.trim();
    out[k] = t === "" ? undefined : t;
  }
  return out;
}

export function zodErrors(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
}
