"use client";

import { startTransition, useActionState, useState } from "react";
import { addS18aDetails } from "@/app/donate/s18a/actions";
import { FormStateProvider } from "@/components/forms/action-form";
import { TextField } from "@/components/forms/fields";
import type { S18aFormState } from "@/lib/donations/s18a-complete";
import type { MissingDetail } from "@/lib/donations/s18a-details";
import { initialFormState } from "@/lib/form";

/** The question asked before saving: the numbers can't be changed here afterwards (only by asking a person). */
export function confirmQuestion(missing: MissingDetail[]): string {
  if (missing.includes("id_number")) return "Save these details? The ID number can't be changed here afterwards.";
  if (missing.includes("registration_number")) return "Save these details? The registration number can't be changed here afterwards.";
  return "Save this address? It can't be changed here afterwards.";
}

/**
 * "Add my details after paying" (decided 04/11/2026): the short form on the thank-you page and on the account page
 * that completes a paid gift's s18A receipt. It asks only for what the gift is missing, asks first before saving
 * (the numbers can't be changed here afterwards), says what it is doing while it saves, keeps what was typed after
 * a refusal or a lost connection, and once saved shows what is now on file and how to have a mistake put right.
 * The ID number is sent once and never kept here.
 */
export function S18aDetailsForm({
  donationId,
  token,
  donorType,
  missing,
  intro,
}: {
  donationId: string;
  /** The credential from the donor's payment link (thank-you page). Without it the signed-in account is used. */
  token?: string;
  donorType: string;
  /** What the gift still lacks: only these boxes are shown. */
  missing: MissingDetail[];
  intro?: string;
}) {
  const safeAction = async (prev: S18aFormState, formData: FormData): Promise<S18aFormState> => {
    try {
      return await addS18aDetails(prev, formData);
    } catch (e) {
      const digest = (e as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      return {
        ok: false,
        message: offline
          ? "You're offline, so your details weren't saved. What you typed is still here. Check your connection and press Save again."
          : "We couldn't reach Givezy, so your details may not have been saved. What you typed is still here. Please try again in a moment.",
      };
    }
  };
  const [state, dispatch, pending] = useActionState(safeAction, initialFormState as S18aFormState);
  const [asking, setAsking] = useState<FormData | null>(null);
  const org = donorType !== "individual";
  const askNumber = missing.includes(org ? "registration_number" : "id_number");
  const askAddress = missing.includes("address");

  if (state.ok) {
    const saved = state.saved;
    return (
      <div role="status" className="space-y-2 rounded-control bg-success-soft p-3 text-sm text-success">
        <p className="font-semibold">{state.message}</p>
        {saved ? (
          <>
            <ul className="space-y-1 text-navy">
              {saved.idLast4 ? <li>SA ID number ending {saved.idLast4}</li> : null}
              {saved.registrationNumber ? <li>Registration number <span dir="auto">{saved.registrationNumber}</span></li> : null}
              {saved.address ? <li>Address: <span dir="auto">{saved.address}</span></li> : null}
            </ul>
            <p className="text-navy">{saved.correction}</p>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <FormStateProvider state={state}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setAsking(new FormData(e.currentTarget));
        }}
      >
        {intro ? <p className="text-sm text-navy">{intro}</p> : null}
        <input type="hidden" name="donation_id" value={donationId} />
        {token ? <input type="hidden" name="t" value={token} /> : null}
        {askNumber ? (
          org ? (
            <TextField
              name="registration_number"
              label="Registration number"
              required
              maxLength={40}
              hint={donorType === "trust" ? "The trust number from the Master of the High Court, for example IT1234/2015." : "The CIPC number, for example 2015/123456/07."}
            />
          ) : (
            <TextField name="id_number" label="SA ID number" required inputMode="numeric" autoComplete="off" maxLength={17} hint="13 digits. SARS needs it to match your s18A receipt to you." />
          )
        ) : null}
        {askAddress ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">{org ? "Registered address" : "Your address"}</legend>
            <p className="text-xs text-muted">SARS needs it on the receipt.</p>
            <TextField name="address_line1" label="Street address" required autoComplete="address-line1" maxLength={200} />
            <TextField name="address_line2" label="Unit, complex or building" autoComplete="address-line2" maxLength={200} />
            <TextField name="suburb" label="Suburb" autoComplete="address-level3" maxLength={80} />
            <TextField name="city" label="City or town" required autoComplete="address-level2" maxLength={80} />
            <TextField name="postal_code" label="Postal code" required inputMode="numeric" autoComplete="postal-code" maxLength={4} />
          </fieldset>
        ) : null}
        {asking ? (
          <div role="alertdialog" aria-label="Please confirm" className="space-y-3 rounded-control border-2 border-honey bg-surface p-3 text-sm">
            <p className="font-medium text-navy">{confirmQuestion(missing)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const held = asking;
                  setAsking(null);
                  startTransition(() => dispatch(held));
                }}
                className="pressable inline-flex min-h-12 items-center rounded-control bg-brand px-5 font-bold text-brand-contrast"
              >
                Yes, save them
              </button>
              <button type="button" onClick={() => setAsking(null)} className="px-2 py-2.5 font-medium text-brand underline">
                Not yet
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} hidden={Boolean(asking)} className="pressable inline-flex min-h-12 items-center rounded-control bg-brand px-5 font-bold text-brand-contrast disabled:opacity-60">
            {pending ? "Saving…" : "Save my s18A details"}
          </button>
          {pending ? <p role="status" className="text-sm text-muted">Saving, please wait…</p> : null}
        </div>
        {state.message && !pending ? <p role="alert" className="text-sm font-semibold text-danger">{state.message}</p> : null}
      </form>
    </FormStateProvider>
  );
}
