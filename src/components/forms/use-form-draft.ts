"use client";

import { useEffect, type RefObject } from "react";

/** Never kept: ID, tax and registration numbers stay out of browser storage (POPIA), consent is always given
 * fresh, and the hidden "website" box (a trap for robots) is never filled in. */
const NEVER = /id_number|tax_number|tax_reference|registration_number|passport|consent|agree|terms|card|^website$/i;
const KEEP_FOR_MS = 2 * 60 * 60 * 1000;

/**
 * Keeps what someone typed into a form for this browser tab (30/10/2026), so coming back from the payment
 * provider's page (a declined card, "Try again", the Back button) finds the details still filled in.
 * Text boxes only, never ID or tax numbers or ticks of agreement; gone when the tab closes or after two hours.
 */
export function useFormDraft(form: RefObject<HTMLFormElement | null>, key: string) {
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const storeKey = `gz_draft:${key}`;
    const fields = () =>
      [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]")].filter(
        (f) => !NEVER.test(f.name) && (f instanceof HTMLTextAreaElement || ["text", "email", "tel", ""].includes(f.type)),
      );
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) ?? "null") as { at: number; values: Record<string, string> } | null;
      if (saved && Date.now() - saved.at < KEEP_FOR_MS) {
        for (const f of fields()) {
          const v = saved.values[f.name];
          if (v && !f.value) f.value = v;
        }
      }
    } catch {
      // Storage blocked or a broken draft: start with an empty form, as before.
    }
    const save = () => {
      try {
        const values: Record<string, string> = {};
        for (const f of fields()) if (f.value) values[f.name] = f.value.slice(0, 500);
        sessionStorage.setItem(storeKey, JSON.stringify({ at: Date.now(), values }));
      } catch {
        // Nothing to do: the form still works, it just won't be remembered.
      }
    };
    el.addEventListener("input", save);
    return () => el.removeEventListener("input", save);
  }, [form, key]);
}
