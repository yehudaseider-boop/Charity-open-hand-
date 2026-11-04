"use client";

import { useEffect, type RefObject } from "react";

/** Never kept: ID, tax and registration numbers stay out of browser storage (POPIA), consent is always given
 * fresh, and the hidden "website" box (a trap for robots) is never filled in. */
const NEVER = /id_number|tax_number|tax_reference|registration_number|passport|consent|agree|terms|card|^website$/i;
const KEEP_FOR_MS = 2 * 60 * 60 * 1000;
/** The few choices that decide which boxes show (who is giving, whether they want an s18A receipt, a dedication). */
const CHOICES = /^(donor_type|wants_18a|s18a_when|dedication_kind)$/;

function draftStoreKey(key: string): string {
  return `gz_draft:${key}`;
}

/**
 * Forgets a kept draft (02/11/2026): once a gift is confirmed, the next person at a shared computer must not
 * find the previous donor's name, email, phone or message filled in. Safe when storage is blocked or empty.
 */
export function clearFormDraft(key: string): void {
  try {
    sessionStorage.removeItem(draftStoreKey(key));
  } catch {
    // Storage blocked: there was nothing kept to forget.
  }
}

/** Forgets the draft for `formKey` as soon as the page shows (for the confirmation page of a paid gift). */
export function ClearFormDraft({ formKey }: { formKey: string }): null {
  useEffect(() => {
    clearFormDraft(formKey);
  }, [formKey]);
  return null;
}

/**
 * Keeps what someone typed into a form for this browser tab (30/10/2026), so coming back from the payment
 * provider's page (a declined card, "Try again", the Back button) finds the details still filled in.
 * Text boxes and the few choices that decide which boxes show, never ID or tax numbers or ticks of agreement;
 * gone when the tab closes or after two hours.
 */
export function useFormDraft(form: RefObject<HTMLFormElement | null>, key: string) {
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const storeKey = draftStoreKey(key);
    const fields = () =>
      [...el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]")].filter(
        // `data-no-draft`: a box the page fills itself (the amount comes back in the address instead).
        (f) => !NEVER.test(f.name) && !f.hasAttribute("data-no-draft") && (f instanceof HTMLTextAreaElement || ["text", "email", "tel", ""].includes(f.type)),
      );
    const choiceInputs = () => [...el.querySelectorAll<HTMLInputElement>("input[type=radio][name], input[type=checkbox][name]")].filter((f) => CHOICES.test(f.name));
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) ?? "null") as { at: number; values: Record<string, string>; choices?: Record<string, string[]> } | null;
      if (saved && Date.now() - saved.at < KEEP_FOR_MS) {
        const restoreText = () => {
          for (const f of fields()) {
            const v = saved.values[f.name];
            if (v && !f.value) f.value = v;
          }
        };
        restoreText();
        // A click, so the page's own state follows (the matching boxes appear); then fill the boxes that just appeared.
        for (const f of choiceInputs()) {
          const want = saved.choices?.[f.name]?.includes(f.value) ?? false;
          if (f.type === "radio" ? want && !f.checked : f.checked !== want) f.click();
        }
        restoreText();
      }
    } catch {
      // Storage blocked or a broken draft: start with an empty form, as before.
    }
    const save = () => {
      try {
        const values: Record<string, string> = {};
        for (const f of fields()) if (f.value) values[f.name] = f.value.slice(0, 500);
        const choices: Record<string, string[]> = {};
        for (const f of choiceInputs()) if (f.checked) (choices[f.name] ??= []).push(f.value);
        sessionStorage.setItem(storeKey, JSON.stringify({ at: Date.now(), values, choices }));
      } catch {
        // Nothing to do: the form still works, it just won't be remembered.
      }
    };
    el.addEventListener("input", save);
    el.addEventListener("change", save);
    return () => {
      el.removeEventListener("input", save);
      el.removeEventListener("change", save);
    };
  }, [form, key]);
}
