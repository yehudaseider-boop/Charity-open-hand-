"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { FormStateProvider } from "@/components/forms/action-form";
import { Info } from "@/components/info";
import { TermsAndPrivacyLinks } from "@/components/legal";
import { TextArea, TextField } from "@/components/forms/fields";
import { givingKinds } from "@/lib/donations/validation";
import { formatRand } from "@/lib/money";
import { getQuote, submitDonation, type CheckoutState, type QuoteState } from "./actions";

type Props = {
  slug: string;
  charityName: string;
  receiptsAvailable: boolean;
  minimumLabel: string;
  contributionMinimumLabel: string;
  initialKind?: keyof typeof givingKinds;
  /** The donor came from the phone app, so the confirmation offers a way back to it. */
  fromApp: boolean;
};

export function DonateFlow({ slug, charityName, receiptsAvailable, minimumLabel, contributionMinimumLabel, initialKind, fromApp }: Props) {
  const [quoteState, requestQuote, quoting] = useActionState(getQuote.bind(null, slug), { ok: false } as QuoteState);
  const [editingAmount, setEditingAmount] = useState(true);
  const [giveExtra, setGiveExtra] = useState(false);
  // The details form stays on screen (and keeps what the donor typed) while they
  // change the amount; it just can't be paid until the new amount is confirmed.
  // If the next amount is refused (too small, not a number) the last good quote and everything typed stays,
  // but it cannot be paid until a new amount is accepted.
  const [kept, setKept] = useState<QuoteState["quote"]>(undefined);
  const fresh = quoteState.ok ? quoteState.quote : undefined;
  if (fresh && fresh !== kept) setKept(fresh);
  const quote = fresh ?? kept;

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
          <div className="flex min-w-0 flex-1 items-center rounded-control border border-border bg-surface px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
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
            {quoting ? "Checking…" : "Continue"}
          </button>
        </div>
        <p className="text-xs text-muted">Minimum {minimumLabel}. No Givezy fee. You can make it monthly below.</p>

        <div className="space-y-2 rounded-control bg-bg p-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="give_extra"
              className="mt-1"
              checked={giveExtra}
              onChange={(e) => {
                setGiveExtra(e.target.checked);
                setEditingAmount(true);
              }}
            />
            <span>Also give to Givezy, to help keep this platform running. Optional.</span>
          </label>
          {giveExtra ? (
            <div>
              <label htmlFor="contribution" className="block text-sm font-medium">Your contribution to Givezy</label>
              <div className="mt-1 flex items-center rounded-control border border-border bg-surface px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
                <span className="text-muted">R</span>
                <input
                  id="contribution"
                  name="contribution"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  onChange={() => setEditingAmount(true)}
                  className="min-w-0 flex-1 bg-transparent px-2 py-2.5 outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-muted">Any amount, minimum {contributionMinimumLabel}. Paid together with your donation, kept separate from it.</p>
            </div>
          ) : null}
        </div>
        {!quoteState.ok && quoteState.message ? <p role="alert" className="text-sm text-danger">{quoteState.message}</p> : null}
      </form>

      {quote ? (
        <DetailsStep
          stale={editingAmount || !quoteState.ok}
          quote={quote}
          slug={slug}
          charityName={charityName}
          receiptsAvailable={receiptsAvailable}
          initialKind={initialKind}
          fromApp={fromApp}
        />
      ) : null}
    </div>
  );
}

function Breakdown({ q, charityName }: { q: NonNullable<QuoteState["quote"]>; charityName: string }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between gap-3"><dt>Donation to {charityName}</dt><dd>{formatRand(q.amountCents)}</dd></div>
      {q.contributionCents > 0 ? (
        <div className="flex justify-between gap-3"><dt>Contribution to Givezy</dt><dd>{formatRand(q.contributionCents)}</dd></div>
      ) : null}
      <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd>{formatRand(q.totalCents)}</dd></div>
    </dl>
  );
}

/** A page-unique id, safe in id and aria-describedby attributes (as in forms/fields.tsx). */
function useFieldId(name: string) {
  return `${name}-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/**
 * A consent box. `children` is the label (clicking it ticks the box); `detail` follows it in the same
 * sentence but outside the label, so links in it can be clicked without toggling the box.
 */
function Check({ name, children, detail, error }: { name: string; children: React.ReactNode; detail?: React.ReactNode; error?: string }) {
  const [checked, setChecked] = useState(false);
  const id = useFieldId(name);
  const showError = Boolean(error) && !checked;
  const describedBy = [detail ? `${id}-detail` : null, showError ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <div className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          name={name}
          className="mt-1"
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
      {showError ? <p id={`${id}-error`} role="alert" className="ml-6 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function DetailsStep({ slug, charityName, receiptsAvailable, quote, stale, initialKind, fromApp }: {
  slug: string; charityName: string; receiptsAvailable: boolean; quote: NonNullable<QuoteState["quote"]>; stale: boolean;
  initialKind?: keyof typeof givingKinds; fromApp: boolean;
}) {
  // A new amount from the form above replaces the shown one; so does a corrected one from the server.
  const [shownQuote, setShownQuote] = useState(quote);
  const [lastQuote, setLastQuote] = useState(quote);
  if (quote !== lastQuote) {
    setLastQuote(quote);
    setShownQuote(quote);
  }
  const [state, dispatch, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData) => {
      const next = await submitDonation(slug, shownQuote.amountCents, shownQuote.contributionCents, shownQuote.totalCents, fromApp, prev, fd);
      if (next.quote) setShownQuote(next.quote);
      return next;
    },
    { ok: false } as CheckoutState,
  );
  const [donorType, setDonorType] = useState<"individual" | "company" | "trust">("individual");
  const [want18a, setWant18a] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const org = donorType !== "individual";
  const givingKindErrorId = `${useFieldId("giving_kind")}-error`;
  const givingKindError = state.fieldErrors?.giving_kind;

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
        <Breakdown q={shownQuote} charityName={charityName} />

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
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" hint="Optional." />

        {receiptsAvailable ? (
          <div className="space-y-3 rounded-control bg-bg p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" name="wants_18a" className="mt-1" checked={want18a} onChange={(e) => setWant18a(e.target.checked)} />
              <span>I want an s18A tax receipt</span>
            </label>
            <Info terms={["s18a"]} label="an s18A receipt" />
            {want18a ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  You&apos;ll get one s18A receipt for all your donations to {charityName} each tax year.
                </p>
                {org ? null : (
                  <TextField name="id_number" label="SA ID number" inputMode="numeric" hint="Or give your income tax number below." />
                )}
                <TextField name="tax_reference" label="Income tax number" inputMode="numeric" hint={org ? "If you have one." : "10 digits. Needed if you don't give your ID number."} />
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
                <input type="radio" name="giving_kind" value={value} required defaultChecked={value === initialKind} aria-describedby={givingKindError ? givingKindErrorId : undefined} />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">Counts towards your maaser and chomesh in the Givezy app. Only you see this.</p>
          <Info terms={["maaser", "chomesh", "generalTzedaka"]} label="maaser and chomesh" />
          {givingKindError ? <p id={givingKindErrorId} role="alert" className="text-xs text-danger">{givingKindError}</p> : null}
        </fieldset>

        <Dedicate error={state.fieldErrors?.dedication_name} />

        <TextArea name="message" label={`Message to ${charityName}`} rows={3} />

        <div className="space-y-2 rounded-control bg-bg p-3">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" name="monthly" className="mt-1" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
            <span>Give {formatRand(shownQuote.totalCents)} every month</span>
          </label>
          {monthly ? (
            <>
              <p className="text-xs text-muted">
                Your first payment is today. After that we collect the same amount on this day of each month (the last day, in shorter months) from the same card, until you cancel. Card payments only.
                You can pause or cancel at any time in the Givezy app or from your account on this website.
              </p>
              <Check key={shownQuote.totalCents} name="monthly_authorised" error={state.fieldErrors?.monthly_authorised}>
                I authorise Givezy to collect {formatRand(shownQuote.totalCents)} from my card every month until I cancel.
              </Check>
            </>
          ) : null}
        </div>

        <div className="space-y-2">
          <Check name="is_anonymous">
            Give anonymously. Your name won&apos;t appear on public pages, campaign lists or live totals.{" "}
            <span className="text-muted">{charityName} still sees your details, because it needs them to record your donation{receiptsAvailable ? " and issue your s18A receipt" : ""}.</span>
          </Check>
          <Check name="age_confirmed" error={state.fieldErrors?.age_confirmed}>
            I am 18 or older{org ? ", and allowed to give on behalf of this organisation" : ""}.
          </Check>
          <Check
            name="popia_consent"
            error={state.fieldErrors?.popia_consent}
            detail={
              <>
                <TermsAndPrivacyLinks />, and that my details are shared with {charityName} so they can record my donation.
                Givezy keeps my maaser, chomesh or tzedaka choice privately, for my own records.
              </>
            }
          >
            I agree to
          </Check>
        </div>

        {/* Hidden from people; bots fill it in. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

        {stale ? <p role="status" className="text-sm text-muted">You changed the amount. Press Continue above to confirm it before paying.</p> : null}
        <button disabled={pending || stale} className="w-full rounded-control bg-brand px-4 py-3 font-medium text-brand-contrast disabled:opacity-60">
          {pending ? "Please wait…" : monthly ? `Pay ${formatRand(shownQuote.totalCents)} now, then monthly` : `Pay ${formatRand(shownQuote.totalCents)}`}
        </button>
        {state.message ? <p role="status" className="text-sm text-danger">{state.message}</p> : null}
        <p className="text-xs text-muted">You&apos;ll enter your card details on the payment provider&apos;s secure page. We never see or store them.</p>
      </form>
    </FormStateProvider>
  );
}

/**
 * Optional: give in honour of, or in memory of, someone. The charity sees it on the donation;
 * it is never on the s18A receipt. A note about the person goes in the message below.
 */
function Dedicate({ error }: { error?: string }) {
  const [kind, setKind] = useState<"none" | "honour" | "memory">("none");
  const errorId = `${useFieldId("dedication_kind")}-error`;
  const showError = Boolean(error) && kind === "none";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Dedicate this donation <span className="font-normal text-muted">(optional)</span></legend>
      <div className="flex flex-wrap gap-2">
        {([["none", "No"], ["honour", "In honour of"], ["memory", "In memory of"]] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
            <input type="radio" name="dedication_kind" value={value} checked={kind === value} onChange={() => setKind(value)} aria-describedby={showError ? errorId : undefined} />
            {label}
          </label>
        ))}
      </div>
      {kind !== "none" ? (
        <TextField name="dedication_name" label="Their name" required autoDirection hint={`${charityLabel(kind)} The charity sees this name; it is not on your s18A receipt.`} />
      ) : null}
      {showError ? <p id={errorId} role="alert" className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}

const charityLabel = (kind: "honour" | "memory") => (kind === "honour" ? "Shown as \u201cIn honour of\u201d this person." : "Shown as \u201cIn memory of\u201d this person.");

