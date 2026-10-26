"use client";

import { SOURCE_PARAM, type SourceTag } from "@/lib/donations/source";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { FormStateProvider } from "@/components/forms/action-form";
import { Info } from "@/components/info";
import { SupportContact, TermsAndPrivacyLinks } from "@/components/legal";
import { ErrorMark, TextArea, TextField, useFieldId } from "@/components/forms/fields";
import { formatRand } from "@/lib/money";
import { getQuote, submitDonation, type CheckoutState, type QuoteState } from "./actions";
import { impactLine, impactSource, type ImpactUnit } from "@/lib/charity/impact";
import { platformConfig } from "@/config/platform";
import { parseRandToCents } from "@/lib/money";

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
  /** The shared link's tag (WhatsApp, a copied link, the QR poster), kept on the gift for the charity. */
  source?: SourceTag | null;
  /** What one gift pays for, in the charity's own figure. */
  impactUnit?: ImpactUnit | null;
  /** The payment provider's rates are known, so the donor may cover the card charge. */
  cardChargeAvailable?: boolean;
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

export function DonateFlow({ slug, charityName, receiptsAvailable, minimumLabel, suggestedCents = [], contributionMinimumLabel, initialLabel, initialAmountCents, fromApp, campaign, account, source, impactUnit, cardChargeAvailable = false }: Props) {
  // What the typed amount pays for, as the donor types it (only when the charity set its own figure).
  const [typedCents, setTypedCents] = useState<number | null>(initialAmountCents ?? null);
  // Only for an amount we can take: never a "pays for" line next to an amount the server will refuse.
  const typedImpact = impactUnit && typedCents && typedCents >= platformConfig.minDonationCents && typedCents <= platformConfig.maxDonationCents ? impactLine(typedCents, impactUnit) : null;
  const [quoteState, requestQuote, quoting] = useActionState(async (prev: QuoteState, fd: FormData): Promise<QuoteState> => {
    try {
      return await getQuote(slug, prev, fd);
    } catch (e) {
      return offlineOrDown(e, "quote");
    }
  }, { ok: false } as QuoteState);
  const [editingAmount, setEditingAmount] = useState(true);
  const [giveExtra, setGiveExtra] = useState(false);
  // The suggested amount the donor tapped, shown as chosen until they type their own.
  const [picked, setPicked] = useState<number | null>(initialAmountCents && suggestedCents.includes(initialAmountCents) ? initialAmountCents : null);
  const amountRef = useRef<HTMLInputElement>(null);
  // The details form stays on screen (and keeps what the donor typed) while they
  // change the amount; it just can't be paid until the new amount is confirmed.
  // If the next amount is refused (too small, not a number) the last good quote and everything typed stays,
  // but it cannot be paid until a new amount is accepted.
  const [kept, setKept] = useState<QuoteState["quote"]>(undefined);
  const fresh = quoteState.ok ? quoteState.quote : undefined;
  if (fresh && fresh !== kept) setKept(fresh);
  const quote = fresh ?? kept;
  // Continue accepted a new amount: bring "Your gift" into view (on a phone it opens below the fold).
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fresh || !detailsRef.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    detailsRef.current.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    // Keyboard and screen-reader users land there too: "Your gift" is read out, and Tab carries on from it.
    detailsRef.current.querySelector<HTMLElement>("#your-gift")?.focus({ preventScroll: true });
  }, [fresh]);
  // The amount's problem sits right under the box, and goes once the donor edits it.
  const amountError = !quoteState.ok && quoteState.message && !editingAmount ? quoteState.message : null;

  return (
    <div className="space-y-4">
      <Steps current={quote && !editingAmount ? 1 : 0} />
      <form
        noValidate
        className="space-y-4 rounded-[1.75rem] border-2 border-border bg-surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setEditingAmount(false);
          startTransition(() => requestQuote(fd));
        }}
      >
        {/* Sent only if Continue is pressed before the page has loaded (the browser posts the form itself): the
            page reads these back, so the campaign, the way back to the app, the label and the share tag stay. */}
        {campaign ? <input type="hidden" name="campaign" value={campaign.id} /> : null}
        {fromApp ? <input type="hidden" name="from" value="app" /> : null}
        {initialLabel ? <input type="hidden" name="label" value={initialLabel} /> : null}
        {source ? <input type="hidden" name="src" value={source} /> : null}
        <label htmlFor="amount" className="block font-display text-2xl font-bold text-indigo">How much would you like to give?</label>
        {suggestedCents.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label={`Amounts suggested by ${charityName}`}>
            {suggestedCents.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  if (!amountRef.current) return;
                  amountRef.current.value = centsToInput(c);
                  amountRef.current.focus();
                  setPicked(c);
                  setTypedCents(c);
                  setEditingAmount(true);
                }}
                aria-pressed={picked === c}
                className={`rounded-2xl border-2 px-2 py-3 text-[17px] font-bold tabular-nums transition ${picked === c ? "border-brand bg-brand text-white" : "border-border bg-surface text-navy hover:border-brand"}`}
              >
                {formatRand(c)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-control border-2 border-border bg-surface px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft has-[[aria-invalid=true]]:border-danger">
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
              onChange={(e) => {
                setPicked(null);
                setTypedCents(parseRandToCents(e.target.value));
                setEditingAmount(true);
              }}
              className="min-w-0 flex-1 bg-transparent px-2 py-3 font-display text-2xl text-navy outline-none"
            />
          </div>
          <button disabled={quoting} className="pressable rounded-control bg-brand px-5 py-3 font-bold text-brand-contrast disabled:opacity-60">
            {quoting ? "Checking…" : "Continue"}
          </button>
        </div>
        {amountError ? <p id="amount-error" role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger"><ErrorMark /><span>{amountError}</span></p> : null}
        {typedImpact && impactUnit && !amountError ? (
          <p className="rounded-control bg-honey-soft px-4 py-3 text-sm" aria-live="polite">
            <span className="font-semibold text-navy">{typedImpact}.</span> <span className="text-muted">{impactSource(charityName, impactUnit)}</span>
          </p>
        ) : null}
        {/* While the amount has a problem, its message says what to do; the hint comes back once it is fixed. */}
        {amountError ? null : <p className="text-sm text-muted">Minimum {minimumLabel}. No Givezy fee.{campaign ? "" : " You can make it monthly below."}</p>}

        <div className="space-y-2 rounded-control bg-honey-soft p-4">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
            <input
              type="checkbox"
              name="give_extra"
              className="mt-0.5"
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
              <div className="mt-1 flex items-center rounded-[0.875rem] border-2 border-border bg-surface px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft">
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
          {cardChargeAvailable ? (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-border py-1 pt-3 text-sm">
              <input type="checkbox" name="cover_card_charge" className="mt-0.5" onChange={() => setEditingAmount(true)} />
              <span>Cover the card charge, so {charityName} gets your full donation. Optional. You&apos;ll see the amount before you pay.</span>
            </label>
          ) : null}
        </div>
      </form>

      {quote ? (
        <div ref={detailsRef} className="scroll-mt-24">
        <DetailsStep
          stale={editingAmount || quoting || !quoteState.ok}
          checking={quoting}
          quote={quote}
          slug={slug}
          charityName={charityName}
          receiptsAvailable={receiptsAvailable}
          initialLabel={initialLabel}
          fromApp={fromApp}
          campaign={campaign}
          account={account}
          source={source}
        />
        </div>
      ) : null}
    </div>
  );
}

/** Where the donor is: choosing the amount, filling in details, then paying on the provider's page. */
function Steps({ current }: { current: 0 | 1 }) {
  const steps = ["Amount", "Your details", "Pay securely"];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
      {steps.map((label, i) => {
        const done = i < current;
        const here = i === current;
        return (
          <li key={label} aria-current={here ? "step" : undefined} className="flex flex-col gap-1.5">
            <span aria-hidden className={`h-1.5 rounded-full transition-colors ${done || here ? "bg-brand" : "bg-brand-soft"}`} />
            <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${here ? "text-brand" : done ? "text-navy" : "text-muted"}`}>
              {i === 2 ? (
                <svg aria-hidden viewBox="0 0 24 24" width="13" height="13" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-current">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              ) : null}
              {label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Breakdown({ q, charityName }: { q: NonNullable<QuoteState["quote"]>; charityName: string }) {
  return (
    <dl className="space-y-1.5 rounded-control bg-honey-soft p-4 text-[15px] tabular-nums">
      <div className="flex justify-between gap-3"><dt>Donation to {charityName}</dt><dd className="shrink-0">{formatRand(q.amountCents)}</dd></div>
      {q.contributionCents > 0 ? (
        <div className="flex justify-between gap-3"><dt>Contribution to Givezy</dt><dd className="shrink-0">{formatRand(q.contributionCents)}</dd></div>
      ) : null}
      {q.cardChargeCents > 0 ? (
        <div className="flex justify-between gap-3"><dt className="min-w-0">Card charge, so {charityName} gets the full {formatRand(q.amountCents)}</dt><dd className="shrink-0">{formatRand(q.cardChargeCents)}</dd></div>
      ) : null}
      <div className="flex justify-between gap-3 border-t-2 border-border pt-2 text-lg font-bold"><dt>Total</dt><dd className="shrink-0">{formatRand(q.totalCents)}</dd></div>
    </dl>
  );
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

function DetailsStep({ slug, charityName, receiptsAvailable, quote, stale, checking, initialLabel, fromApp, campaign, account, source }: {
  slug: string; charityName: string; receiptsAvailable: boolean; quote: NonNullable<QuoteState["quote"]>; stale: boolean; checking: boolean;
  initialLabel?: string; fromApp: boolean; campaign?: { id: string; title: string };
  account?: { email: string; savedIdLast4: string | null };
  source?: SourceTag | null;
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
        const next = await submitDonation(slug, shownQuote.amountCents, shownQuote.contributionCents, shownQuote.cardChargeCents > 0, shownQuote.totalCents, fromApp, campaign?.id, prev, fd);
        if (next.quote) setShownQuote(next.quote);
        return { ...next, failedToStart: next.failedToStart ?? false };
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
  const idBoxesShown = org || !(account?.savedIdLast4 && useSavedId);
  const formRef = useRef<HTMLFormElement>(null);
  // The folded extras (label, dedication, message): open from the start when the app sent a label.
  const [extrasOpen, setExtrasOpen] = useState(Boolean(initialLabel));
  // How many things needed fixing at the last press of Pay (the count is refreshed on the next press).
  const fixCount = Object.keys(state.fieldErrors ?? {}).length;
  const extrasNeedFixing = ["giving_label", "dedication_kind", "dedication_name", "message"].some((k) => Boolean(state.fieldErrors?.[k]));
  // After a refusal, take the donor to the first thing to fix (it may be far above the Pay button).
  useEffect(() => {
    if (!state.fieldErrors) return;
    const first = formRef.current?.querySelector<HTMLElement>(FIX_TARGET);
    first?.focus();
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  return (
    <FormStateProvider state={state}>
      <form
        ref={formRef}
        noValidate
        className="space-y-5 rounded-[1.75rem] border-2 border-border bg-surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
      >
        {source ? <input type="hidden" name={SOURCE_PARAM} value={source} /> : null}
        <h2 id="your-gift" tabIndex={-1} className="font-display text-2xl font-bold">Your gift</h2>
        <Breakdown q={shownQuote} charityName={charityName} />
        {campaign ? <p className="text-sm text-muted">For the campaign: <span className="font-medium text-text">{campaign.title}</span></p> : null}

        <h2 className="border-t-2 border-border pt-5 font-display text-2xl font-bold">Your details</h2>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Giving as</legend>
          <div className="flex flex-wrap gap-2">
            {(["individual", "company", "trust"] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-border px-4 py-2 text-sm font-semibold has-checked:border-brand has-checked:bg-honey-soft has-checked:text-brand">
                <input type="radio" name="donor_type" value={t} checked={donorType === t} onChange={() => setDonorType(t)} />
                {t === "individual" ? "Myself" : t === "company" ? "A company" : "A trust"}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Both sets stay on the page, the other one hidden and disabled (so not sent), so switching between
            "Myself" and a company or trust keeps what was typed in each. */}
        <fieldset hidden={!org} disabled={!org} className="space-y-5">
          <TextField name="organisation_name" label={donorType === "trust" ? "Trust name" : "Company name"} required autoComplete="organization" maxLength={200} />
          <TextField name="registration_number" label="Registration number" required={want18a} maxLength={40} />
          <TextField name="contact_person" label="Contact person" required autoComplete="name" maxLength={120} />
        </fieldset>
        <fieldset hidden={org} disabled={org} className="space-y-5">
          <TextField name="first_name" label="First name" required autoComplete="given-name" maxLength={80} />
          <TextField name="last_name" label="Surname" required autoComplete="family-name" maxLength={80} />
        </fieldset>
        <TextField name="email" label="Email" type="email" required autoComplete="email" defaultValue={account?.email} hint="Your confirmation goes here." maxLength={254} />
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" hint="Only for questions about your donation." maxLength={20} />

        {receiptsAvailable ? (
          <div className="space-y-3 rounded-control bg-honey-soft p-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
              <input type="checkbox" name="wants_18a" checked={want18a} onChange={(e) => setWant18a(e.target.checked)} />
              <span>I want an s18A receipt</span>
            </label>
            <Info terms={["s18a"]} label="an s18A receipt" />
            {/* Hidden, not removed, so unticking and ticking again keeps what was typed. Disabled, it isn't sent. */}
            <fieldset hidden={!want18a} disabled={!want18a} className="space-y-3">
                <p className="text-sm text-muted">
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
                        {/* There's no ID box to mark in red here, so a problem with the saved number is said in words,
                            and Pay's "take me to it" lands on these words. */}
                        {state.fieldErrors?.id_number ? (
                          <p role="alert" tabIndex={-1} data-fix className="text-xs font-medium text-danger">{state.fieldErrors.id_number}</p>
                        ) : null}
                      </>
                    ) : null}
                  </fieldset>
                ) : null}
                {/* Hidden and disabled rather than removed, so a number typed here survives switching back and forth. */}
                <fieldset hidden={!idBoxesShown} disabled={!idBoxesShown} className="space-y-3">
                  <fieldset hidden={org} disabled={org}>
                    <TextField name="id_number" label="SA ID number" inputMode="numeric" hint="Or give your income tax number below." maxLength={17} />
                  </fieldset>
                  <TextField name="tax_reference" label="Income tax number" inputMode="numeric" maxLength={10} hint={org ? "If you have one." : "10 digits. Needed if you don't give your ID number."} />
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">{org ? "Registered address" : "Your address"}</legend>
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
          <p className="rounded-control bg-warning-soft p-4 text-sm font-semibold text-warning">
            {charityName} is not s18A-approved, so this donation won&apos;t get a tax receipt.
          </p>
        )}

        {/* The optional extras stay folded so the form is short on a phone. A closed section still sends its fields;
            it opens by itself when something in it is already filled in (a label from the app) or needs fixing. */}
        <details
          open={extrasOpen || extrasNeedFixing}
          onToggle={(e) => setExtrasOpen(e.currentTarget.open)}
          className="group rounded-control border-2 border-border open:pb-4"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="font-semibold text-navy">Add a label, dedication or message</span>
              <span className="text-sm text-muted">Optional</span>
            </span>
            <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-brand transition-transform group-open:rotate-180">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="space-y-5 px-4 pt-2">
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
          </div>
        </details>

        {/* Campaign gifts are once-off: a monthly gift would carry on after the campaign ends. */}
        {campaign ? null : <div className="space-y-2 rounded-control bg-honey-soft p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
            <input type="checkbox" name="monthly" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
            <span>Give {formatRand(shownQuote.totalCents)} every month</span>
          </label>
          {monthly ? (
            <>
              <p className="text-sm text-muted">
                Your first payment is today. After that we collect the same amount on this day of each month (the last day, in shorter months) from the same card, until you cancel. Card payments only.
                You can pause or cancel at any time in the Givezy app or from your account on this website.
              </p>
              {shownQuote.totalCents !== shownQuote.amountCents ? <p className="text-sm text-muted">{monthlyParts(shownQuote, charityName)}</p> : null}
              <Check key={shownQuote.totalCents} name="monthly_authorised" error={state.fieldErrors?.monthly_authorised}>
                I authorise Givezy to collect {formatRand(shownQuote.totalCents)} from my card every month until I cancel.
              </Check>
            </>
          ) : null}
        </div>}

        <h2 className="border-t-2 border-border pt-5 font-display text-2xl font-bold">Before you pay</h2>
        <div className="space-y-3">
          <Check name="is_anonymous">
            Give anonymously. Your name won&apos;t appear on public pages, campaign lists or live totals.{" "}
            <span className="text-muted">{charityName} still sees your details, because it needs them to record your donation{receiptsAvailable ? " and issue your s18A receipt" : ""}.</span>
          </Check>
          <Check name="no_news">
            Don&apos;t send me news or appeals from {charityName}. <span className="text-muted">You&apos;ll still get your confirmation{receiptsAvailable ? " and s18A receipt" : ""}.</span>
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

        {/* While a new amount is being checked, Pay waits too: it must never go through at the old amount. */}
        {checking ? <p role="status" className="rounded-control bg-brand-soft p-3 text-sm font-semibold text-indigo">Checking the new amount…</p> : stale ? <p role="status" className="rounded-control bg-warning-soft p-3 text-sm font-semibold text-warning">You changed the amount. Press Continue above to confirm it before paying.</p> : null}
        <button disabled={pending || stale} className="pressable w-full rounded-control bg-coral px-4 py-3.5 text-lg font-bold text-navy disabled:opacity-60">
          {pending ? "Please wait…" : monthly ? `Pay ${formatRand(shownQuote.totalCents)} now, then monthly` : `Pay ${formatRand(shownQuote.totalCents)}`}
        </button>
        {state.message ? (
          <div role="alert" className="space-y-1 rounded-control border-2 border-danger-soft p-4 text-sm">
            <p className="flex items-start gap-1.5 font-semibold text-danger"><ErrorMark /><span>{state.message}</span></p>
            {/* The page has already jumped to the first problem; this takes the donor back to it after scrolling down. */}
            {fixCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const first = formRef.current?.querySelector<HTMLElement>(FIX_TARGET);
                  first?.focus();
                  first?.scrollIntoView({ block: "center", behavior: "smooth" });
                }}
                className="min-h-11 font-bold text-brand underline underline-offset-4"
              >
                Show me the first one
              </button>
            ) : null}
            {state.failedToStart ? <p className="text-muted">If it keeps happening: <SupportContact />.</p> : null}
            {state.campaignEnded ? (
              <a href={`/c/${slug}/donate?${new URLSearchParams({ cents: String(shownQuote.amountCents), ...(fromApp ? { from: "app" } : {}), ...(source ? { [SOURCE_PARAM]: source } : {}), ...(initialLabel ? { label: initialLabel } : {}) }).toString()}`} className="inline-block font-bold text-brand underline underline-offset-4">
                Give {formatRand(shownQuote.amountCents)} to {charityName} instead
              </a>
            ) : null}
          </div>
        ) : null}
        <p className="text-center text-sm text-muted">You&apos;ll enter your card details on the payment provider&apos;s secure page. We never see or store them.</p>
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
      <legend className="text-sm font-semibold">Dedicate this donation <span className="font-normal text-muted">(optional)</span></legend>
      <div className="flex flex-wrap gap-2">
        {([["none", "No"], ["honour", "In honour of"], ["memory", "In memory of"]] as const).map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-border px-4 py-2 text-sm font-semibold has-checked:border-brand has-checked:bg-honey-soft has-checked:text-brand">
            <input type="radio" name="dedication_kind" value={value} checked={kind === value} onChange={() => setKind(value)} aria-describedby={showError ? errorId : undefined} />
            {label}
          </label>
        ))}
      </div>
      <fieldset hidden={kind === "none"} disabled={kind === "none"}>
        <TextField name="dedication_name" label="Their name" required autoDirection maxLength={80} hint={`${charityLabel(kind === "memory" ? "memory" : "honour")} The charity sees this name; it is not on your s18A receipt.`} />
      </fieldset>
      {showError ? <p id={errorId} role="alert" className="text-xs font-semibold text-danger">{error}</p> : null}
    </fieldset>
  );
}

/** The first thing to fix after Pay: a field marked invalid, or a message that stands in for one (the saved ID number has no box). */
const FIX_TARGET = "[aria-invalid=true]:not(:disabled), [data-fix]";

/** What each monthly collection is made of, when it is more than the donation itself. */
function monthlyParts(q: { amountCents: number; contributionCents: number; cardChargeCents: number; totalCents: number }, charityName: string): string {
  const parts = [`${formatRand(q.amountCents)} to ${charityName}`];
  if (q.contributionCents > 0) parts.push(`${formatRand(q.contributionCents)} to Givezy`);
  if (q.cardChargeCents > 0) parts.push(`${formatRand(q.cardChargeCents)} card charge`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Each month's ${formatRand(q.totalCents)} is ${list}.`;
}

const charityLabel =(kind: "honour" | "memory") => (kind === "honour" ? "Shown as \u201cIn honour of\u201d this person." : "Shown as \u201cIn memory of\u201d this person.");

