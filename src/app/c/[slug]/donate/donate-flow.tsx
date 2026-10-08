"use client";

import { startTransition, useActionState, useState } from "react";
import { FormStateProvider } from "@/components/forms/action-form";
import { TextArea, TextField } from "@/components/forms/fields";
import { givingKinds } from "@/lib/donations/validation";
import { formatRand } from "@/lib/money";
import { getQuote, submitDonation, type CheckoutState, type QuoteState } from "./actions";

type Props = {
  slug: string;
  charityName: string;
  receiptsAvailable: boolean;
  minimumLabel: string;
};

export function DonateFlow({ slug, charityName, receiptsAvailable, minimumLabel }: Props) {
  const [quoteState, requestQuote, quoting] = useActionState(getQuote.bind(null, slug), { ok: false } as QuoteState);
  const [editingAmount, setEditingAmount] = useState(true);
  const quote = quoteState.ok && !editingAmount ? quoteState.quote : undefined;

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-card border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setEditingAmount(false);
          startTransition(() => requestQuote(fd));
        }}
      >
        <label htmlFor="amount" className="block text-sm font-medium">How much would you like to give?</label>
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-control border border-border bg-surface px-3">
            <span className="text-muted">R</span>
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              required
              onChange={() => setEditingAmount(true)}
              className="min-w-0 flex-1 bg-transparent px-2 py-2.5 outline-none"
            />
          </div>
          <button disabled={quoting} className="rounded-control bg-brand px-4 py-2.5 font-medium text-brand-contrast disabled:opacity-60">
            {quoting ? "…" : "Continue"}
          </button>
        </div>
        <p className="text-xs text-muted">Minimum {minimumLabel}. Once-off donation.</p>
        {!quoteState.ok && quoteState.message ? <p role="status" className="text-sm text-danger">{quoteState.message}</p> : null}
      </form>

      {quote ? (
        <DetailsStep
          key={`${quote.amountCents}-${quote.totalCents}`}
          slug={slug}
          charityName={charityName}
          receiptsAvailable={receiptsAvailable}
          initialQuote={quote}
        />
      ) : null}
    </div>
  );
}

function Breakdown({ q }: { q: NonNullable<QuoteState["quote"]> }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between"><dt>Your donation</dt><dd>{formatRand(q.amountCents)}</dd></div>
      <div className="flex justify-between"><dt>Processing fee</dt><dd>{formatRand(q.processingFeeLineCents)}</dd></div>
      <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd>{formatRand(q.totalCents)}</dd></div>
    </dl>
  );
}

function Check({ name, children, error }: { name: string; children: React.ReactNode; error?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name={name} className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>{children}</span>
      </label>
      {error && !checked ? <p className="ml-6 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function DetailsStep({ slug, charityName, receiptsAvailable, initialQuote }: {
  slug: string; charityName: string; receiptsAvailable: boolean; initialQuote: NonNullable<QuoteState["quote"]>;
}) {
  const [shownQuote, setShownQuote] = useState(initialQuote);
  const [state, dispatch, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData) => {
      const next = await submitDonation(slug, shownQuote.amountCents, shownQuote.totalCents, prev, fd);
      if (next.quote) setShownQuote(next.quote);
      return next;
    },
    { ok: false } as CheckoutState,
  );
  const [donorType, setDonorType] = useState<"individual" | "company" | "trust">("individual");
  const [want18a, setWant18a] = useState(false);
  const org = donorType !== "individual";

  return (
    <FormStateProvider state={state}>
      <form
        className="space-y-4 rounded-card border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
      >
        <Breakdown q={shownQuote} />
        <p className="text-xs text-muted">
          {charityName} receives your full donation of {formatRand(shownQuote.amountCents)}. The processing fee covers card
          costs and running this platform.
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Giving as</legend>
          <div className="flex flex-wrap gap-2">
            {(["individual", "company", "trust"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
                <input type="radio" name="donor_type" value={t} checked={donorType === t} onChange={() => setDonorType(t)} />
                {t === "individual" ? "Myself" : t === "company" ? "A company" : "A trust"}
              </label>
            ))}
          </div>
        </fieldset>

        {org ? (
          <>
            <TextField name="organisation_name" label={donorType === "company" ? "Company name" : "Trust name"} required autoComplete="organization" />
            <TextField name="registration_number" label="Registration number" required={want18a} />
            <TextField name="contact_person" label="Contact person" required autoComplete="name" />
          </>
        ) : (
          <>
            <TextField name="first_name" label="First name" required autoComplete="given-name" />
            <TextField name="last_name" label="Surname" required autoComplete="family-name" />
          </>
        )}
        <TextField name="email" label="Email" type="email" required autoComplete="email" hint="Your confirmation goes here." />
        <TextField name="phone" label="Phone" type="tel" required={want18a} autoComplete="tel" />

        {receiptsAvailable ? (
          <div className="space-y-3 rounded-control bg-bg p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" name="wants_18a" className="mt-1" checked={want18a} onChange={(e) => setWant18a(e.target.checked)} />
              <span>I want an 18A tax receipt</span>
            </label>
            {want18a ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  SARS requires these details on the receipt. {charityName} issues one receipt for all your donations each tax
                  year.
                </p>
                {org ? null : <TextField name="id_number" label="SA ID number" required inputMode="numeric" />}
                <TextField name="tax_reference" label="Income tax reference number" inputMode="numeric" hint="If you have one." />
                <TextField name="address_line1" label="Street address" required autoComplete="address-line1" />
                <TextField name="address_line2" label="Unit or building" autoComplete="address-line2" />
                <TextField name="suburb" label="Suburb" />
                <TextField name="city" label="City" required autoComplete="address-level2" />
                <TextField name="postal_code" label="Postal code" required inputMode="numeric" autoComplete="postal-code" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-control bg-warning-soft p-3 text-xs text-warning">
            {charityName} is not s18A-approved, so this donation won&apos;t get a tax receipt.
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">This donation is from</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(givingKinds).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
                <input type="radio" name="giving_kind" value={value} required />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">For your own maaser records. Only you see this.</p>
          {state.fieldErrors?.giving_kind ? <p className="text-xs text-danger">{state.fieldErrors.giving_kind}</p> : null}
        </fieldset>

        <TextArea name="message" label={`Message to ${charityName}`} rows={3} />

        <div className="space-y-2">
          <Check name="is_anonymous">
            Give anonymously. Your name won&apos;t appear on public pages, campaign lists or live totals.{" "}
            <span className="text-muted">{charityName} still sees your details, because it needs them to record your donation{receiptsAvailable ? " and issue your 18A receipt" : ""}.</span>
          </Check>
          <Check name="age_confirmed" error={state.fieldErrors?.age_confirmed}>
            I am 18 or older{org ? ", and allowed to give on behalf of this organisation" : ""}.
          </Check>
          <Check name="popia_consent" error={state.fieldErrors?.popia_consent}>
            I agree that my details are shared with {charityName} so they can record my gift.
          </Check>
        </div>

        {/* Hidden from people; bots fill it in. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

        <button disabled={pending} className="w-full rounded-control bg-brand px-4 py-3 font-medium text-brand-contrast disabled:opacity-60">
          {pending ? "Please wait…" : `Pay ${formatRand(shownQuote.totalCents)}`}
        </button>
        {state.message ? <p role="status" className="text-sm text-danger">{state.message}</p> : null}
        <p className="text-xs text-muted">You&apos;ll enter your card details on the payment provider&apos;s secure page. We never see or store them.</p>
      </form>
    </FormStateProvider>
  );
}
