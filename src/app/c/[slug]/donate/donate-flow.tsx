"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormStateProvider } from "@/components/forms/action-form";
import { Info } from "@/components/info";
import { SupportContact, TermsAndPrivacyLinks } from "@/components/legal";
import { TextArea, TextField } from "@/components/forms/fields";
import { formatRand } from "@/lib/money";
import { getQuote, submitDonation, type CheckoutState, type QuoteState } from "./actions";

type Props = {
  slug: string;
  charityName: string;
  receiptsAvailable: boolean;
  minimumLabel: string;
  /** The charity's own suggested amounts, in cents (it may have none). */
  suggestedCents?: number[];
  contributionMinimumLabel: string;
  /** The label the donor chose in the app, carried over. */
  initialLabel?: string;
  /** Trying again after a declined card: the amount they chose last time. */
  initialAmountCents?: number;
  /** The donor came from the phone app, so the confirmation offers a way back to it. */
  fromApp: boolean;
  /** Giving to one of the charity's campaigns: once-off only. */
  campaign?: { id: string; title: string };
  /** Signed in: their email, and the last four digits of the ID number from their last s18A gift. */
  account?: { email: string; savedIdLast4: string | null };
};

/** As the donor would type it: 180, 180.50. */
const centsToInput = (c: number) => (c % 100 ? `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}` : String(c / 100));

/**
 * A dropped connection or a server error at Continue or Pay stays on this page, with everything typed
 * kept, and says plainly that nothing was charged (the card is only ever entered on the payment page,
 * so nothing can be charged before it opens). Next's own redirect to the payment page still goes through.
 */
function offlineOrDown(e: unknown, step: "quote" | "pay"): { ok: false; message: string } {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (step === "quote") {
    return { ok: false, message: offline ? "You're offline. Check your connection and press Continue again." : "We couldn't check that amount just now. Please press Continue again in a moment." };
  }
  return {
    ok: false,
    message: offline
      ? "You're offline, so your payment wasn't started. Nothing was charged. What you typed is still here. Check your connection and press Pay again."
      : "We couldn't start your payment. Nothing was charged. What you typed is still here. Please try again in a minute.",
  };
}

export function DonateFlow({ slug, charityName, receiptsAvailable, minimumLabel, suggestedCents = [], contributionMinimumLabel, initialLabel, initialAmountCents, fromApp, campaign, account }: Props) {
  const [quoteState, requestQuote, quoting] = useActionState(async (prev: QuoteState, fd: FormData): Promise<QuoteState> => {
    try {
      return await getQuote(slug, prev, fd);
    } catch (e) {
      return offlineOrDown(e, "quote");
    }
  }, { ok: false } as QuoteState);
  const [editingAmount, setEditingAmount] = useState(true);
  const [giveExtra, setGiveExtra] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  // The details form stays on screen (and keeps what the donor typed) while they
  // change the amount; it just can't be paid until the new amount is confirmed.
  // If the next amount is refused (too small, not a number) the last good quote and everything typed stays,
  // but it cannot be paid until a new amount is accepted.
  const [kept, setKept] = useState<QuoteState["quote"]>(undefined);
  const fresh = quoteState.ok ? quoteState.quote : undefined;
  if (fresh && fresh !== kept) setKept(fresh);
  const quote = fresh ?? kept;
  // The amount's problem sits right under the box, and goes once the donor edits it.
  const amountError = !quoteState.ok && quoteState.message && !editingAmount ? quoteState.message : null;

  return (
    <div className="space-y-4">
      <form
        noValidate
        className="space-y-3 rounded-card bg-honey-soft p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setEditingAmount(false);
          startTransition(() => requestQuote(fd));
        }}
      >
        <label htmlFor="amount" className="block font-display text-xl text-indigo">How much would you like to give?</label>
        {suggestedCents.length ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Amounts suggested by ${charityName}`}>
            {suggestedCents.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  if (!amountRef.current) return;
                  amountRef.current.value = centsToInput(c);
                  amountRef.current.focus();
                  setEditingAmount(true);
                }}
                className="rounded-full border-[1.5px] border-brand bg-surface px-4 py-2 font-semibold text-brand hover:bg-brand-soft"
              >
                {formatRand(c)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-control border-[1.5px] border-border bg-surface px-4 focus-within:border-brand">
            <span className="font-display text-2xl text-indigo">R</span>
            <input
              id="amount"
              ref={amountRef}
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              required
              maxLength={16}
              defaultValue={initialAmountCents ? centsToInput(initialAmountCents) : undefined}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? "amount-error" : undefined}
              onChange={() => setEditingAmount(true)}
              className="min-w-0 flex-1 bg-transparent px-2 py-3 font-display text-2xl text-navy outline-none"
            />
          </div>
          <button disabled={quoting} className="pressable rounded-control bg-brand px-5 py-3 font-bold text-brand-contrast disabled:opacity-60">
            {quoting ? "Checking…" : "Continue"}
          </button>
        </div>
        {amountError ? <p id="amount-error" role="alert" className="text-sm text-danger">{amountError}</p> : null}
        <p className="text-xs text-muted">Minimum {minimumLabel}. No Givezy fee.{campaign ? "" : " You can make it monthly below."}</p>

        <div className="space-y-2 rounded-control bg-surface p-3">
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
              <div className="mt-1 flex items-center rounded-control border border-border bg-surface px-3">
                <span className="text-muted">R</span>
                <input
                  id="contribution"
                  name="contribution"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  maxLength={16}
                  onChange={() => setEditingAmount(true)}
                  className="min-w-0 flex-1 bg-transparent px-2 py-2.5 outline-none"
                />
              </div>
              <p className="mt-1 text-xs text-muted">Any amount, minimum {contributionMinimumLabel}. Paid together with your donation, kept separate from it.</p>
            </div>
          ) : null}
        </div>
      </form>

      {quote ? (
        <DetailsStep
          stale={editingAmount || !quoteState.ok}
          quote={quote}
          slug={slug}
          charityName={charityName}
          receiptsAvailable={receiptsAvailable}
          initialLabel={initialLabel}
          fromApp={fromApp}
          campaign={campaign}
          account={account}
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

function DetailsStep({ slug, charityName, receiptsAvailable, quote, stale, initialLabel, fromApp, campaign, account }: {
  slug: string; charityName: string; receiptsAvailable: boolean; quote: NonNullable<QuoteState["quote"]>; stale: boolean;
  initialLabel?: string; fromApp: boolean; campaign?: { id: string; title: string };
  account?: { email: string; savedIdLast4: string | null };
}) {
  // A signed-in donor can reuse the ID number from their last s18A gift. Only its last four digits
  // reach the browser; the server fills in the number.
  const [useSavedId, setUseSavedId] = useState(Boolean(account?.savedIdLast4));
  // A new amount from the form above replaces the shown one; so does a corrected one from the server.
  const [shownQuote, setShownQuote] = useState(quote);
  const [lastQuote, setLastQuote] = useState(quote);
  if (quote !== lastQuote) {
    setLastQuote(quote);
    setShownQuote(quote);
  }
  const [state, dispatch, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData): Promise<CheckoutState> => {
      try {
        const next = await submitDonation(slug, shownQuote.amountCents, shownQuote.contributionCents, shownQuote.totalCents, fromApp, campaign?.id, prev, fd);
        if (next.quote) setShownQuote(next.quote);
        return { ...next, failedToStart: false };
      } catch (e) {
        return { ...offlineOrDown(e, "pay"), failedToStart: true };
      }
    },
    { ok: false } as CheckoutState,
  );
  const [donorType, setDonorType] = useState<"individual" | "company" | "trust">("individual");
  const [want18a, setWant18a] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const org = donorType !== "individual";
  const formRef = useRef<HTMLFormElement>(null);
  // After a refusal, take the donor to the first thing to fix (it may be far above the Pay button).
  useEffect(() => {
    if (!state.fieldErrors) return;
    const first = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
    first?.focus();
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  return (
    <FormStateProvider state={state}>
      <form
        ref={formRef}
        noValidate
        className="space-y-4 rounded-card border border-border bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
      >
        <Breakdown q={shownQuote} charityName={charityName} />
        {campaign ? <p className="text-sm text-muted">For the campaign: <span className="font-medium text-text">{campaign.title}</span></p> : null}

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
            <TextField name="organisation_name" label={donorType === "company" ? "Company name" : "Trust name"} required autoComplete="organization" maxLength={200} />
            <TextField name="registration_number" label="Registration number" required={want18a} maxLength={40} />
            <TextField name="contact_person" label="Contact person" required autoComplete="name" maxLength={120} />
          </>
        ) : (
          <>
            <TextField name="first_name" label="First name" required autoComplete="given-name" maxLength={80} />
            <TextField name="last_name" label="Surname" required autoComplete="family-name" maxLength={80} />
          </>
        )}
        <TextField name="email" label="Email" type="email" required autoComplete="email" defaultValue={account?.email} hint="Your confirmation goes here." maxLength={254} />
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" hint="Only for questions about your donation." maxLength={20} />

        {receiptsAvailable ? (
          <div className="space-y-3 rounded-control bg-bg p-3">
            <label className="flex items-start gap-2 text-sm font-medium">
              <input type="checkbox" name="wants_18a" className="mt-1" checked={want18a} onChange={(e) => setWant18a(e.target.checked)} />
              <span>I want an s18A receipt</span>
            </label>
            <Info terms={["s18a"]} label="an s18A receipt" />
            {/* Hidden, not removed, so unticking and ticking again keeps what was typed. Disabled, it isn't sent. */}
            <fieldset hidden={!want18a} disabled={!want18a} className="space-y-3">
                <p className="text-xs text-muted">
                  You&apos;ll get one s18A receipt for all your donations to {charityName} each tax year.
                </p>
                {!org && account?.savedIdLast4 ? (
                  <fieldset className="space-y-1 text-sm">
                    <legend className="sr-only">Your ID number</legend>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="id_choice" checked={useSavedId} onChange={() => setUseSavedId(true)} />
                      Use my SA ID number ending {account.savedIdLast4}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="id_choice" checked={!useSavedId} onChange={() => setUseSavedId(false)} />
                      Use a different number
                    </label>
                    {useSavedId ? (
                      <>
                        <input type="hidden" name="use_saved_id" value="on" />
                        <p className="text-xs text-muted">From your last s18A gift. Give with your account&apos;s email ({account.email}) to use it.</p>
                      </>
                    ) : null}
                  </fieldset>
                ) : null}
                {org || !(account?.savedIdLast4 && useSavedId) ? (
                  <>
                    {org ? null : (
                      <TextField name="id_number" label="SA ID number" inputMode="numeric" hint="Or give your income tax number below." maxLength={13} />
                    )}
                    <TextField name="tax_reference" label="Income tax number" inputMode="numeric" maxLength={10} hint={org ? "If you have one." : "10 digits. Needed if you don't give your ID number."} />
                  </>
                ) : null}
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">{org ? "Registered address" : "Your address"}</legend>
                  <p className="text-xs text-muted">
                    SARS needs it on the receipt.
                    {!org && account?.savedIdLast4 && useSavedId ? " Leave it empty to use the address from your last s18A gift." : ""}
                  </p>
                  <TextField name="address_line1" label="Street address" autoComplete="address-line1" maxLength={200} />
                  <TextField name="address_line2" label="Unit, complex or building" autoComplete="address-line2" maxLength={200} />
                  <TextField name="suburb" label="Suburb" autoComplete="address-level3" maxLength={80} />
                  <TextField name="city" label="City or town" autoComplete="address-level2" maxLength={80} />
                  <TextField name="postal_code" label="Postal code" inputMode="numeric" autoComplete="postal-code" maxLength={4} />
                </fieldset>
            </fieldset>
          </div>
        ) : (
          <p className="rounded-control bg-warning-soft p-3 text-xs text-warning">
            {charityName} is not s18A-approved, so this donation won&apos;t get a tax receipt.
          </p>
        )}

        <TextField
          name="giving_label"
          label="Your label"
          maxLength={80}
          defaultValue={initialLabel}
          autoDirection
          hint="Only you see it, in your giving records. For example: Work giving, Family, or Maaser."
        />

        <Dedicate error={state.fieldErrors?.dedication_name} />

        <TextArea name="message" label={`Message to ${charityName}`} rows={3} maxLength={500} />

        {/* Campaign gifts are once-off: a monthly gift would carry on after the campaign ends. */}
        {campaign ? null : <div className="space-y-2 rounded-control bg-bg p-3">
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
        </div>}

        <div className="space-y-2">
          <Check name="is_anonymous">
            Give anonymously. Your name won&apos;t appear on public pages, campaign lists or live totals.{" "}
            <span className="text-muted">{charityName} still sees your details, because it needs them to record your donation{receiptsAvailable ? " and issue your s18A receipt" : ""}.</span>
          </Check>
          <Check name="age_confirmed" error={state.fieldErrors?.age_confirmed}>
            I am 18 or older{org ? ", and allowed to give on behalf of this organisation" : ""}.
          </Check>
          <Check name="popia_consent" error={state.fieldErrors?.popia_consent}>
            I agree to <TermsAndPrivacyLinks />, and that my details are shared with {charityName} so they can record my
            donation. Givezy keeps any label I give it privately, for my own records.
          </Check>
        </div>

        {/* Hidden from people; bots fill it in. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

        {stale ? <p role="status" className="text-sm text-muted">You changed the amount. Press Continue above to confirm it before paying.</p> : null}
        <button disabled={pending || stale} className="pressable w-full rounded-control bg-coral px-4 py-3.5 text-lg font-bold text-navy disabled:opacity-60">
          {pending ? "Please wait…" : monthly ? `Pay ${formatRand(shownQuote.totalCents)} now, then monthly` : `Pay ${formatRand(shownQuote.totalCents)}`}
        </button>
        {state.message ? (
          <div role="alert" className="space-y-1 text-sm text-danger">
            <p>{state.message}</p>
            {state.failedToStart ? <p className="text-muted">If it keeps happening: <SupportContact />.</p> : null}
          </div>
        ) : null}
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
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Dedicate this donation <span className="font-normal text-muted">(optional)</span></legend>
      <div className="flex flex-wrap gap-2">
        {([["none", "No"], ["honour", "In honour of"], ["memory", "In memory of"]] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm has-checked:border-brand has-checked:bg-brand-soft">
            <input type="radio" name="dedication_kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
            {label}
          </label>
        ))}
      </div>
      <fieldset hidden={kind === "none"} disabled={kind === "none"}>
        <TextField name="dedication_name" label="Their name" required autoDirection maxLength={200} hint={`${charityLabel(kind === "memory" ? "memory" : "honour")} The charity sees this name; it is not on your s18A receipt.`} />
      </fieldset>
      {error && kind === "none" ? <p className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}

const charityLabel = (kind: "honour" | "memory") => (kind === "honour" ? "Shown as \u201cIn honour of\u201d this person." : "Shown as \u201cIn memory of\u201d this person.");

