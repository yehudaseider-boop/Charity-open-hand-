"use client";

import { SOURCE_PARAM, type SourceTag } from "@/lib/donations/source";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormDraft } from "@/components/forms/use-form-draft";
import { FormStateProvider } from "@/components/forms/action-form";
import { Info } from "@/components/info";
import { SupportContact, TermsAndPrivacyLinks } from "@/components/legal";
import { ErrorMark, TextArea, TextField, useFieldId } from "@/components/forms/fields";
import { formatRand, parseRandToCents } from "@/lib/money";
import { submitDonation, type CheckoutState } from "./actions";
import { impactLine, impactSource, type ImpactUnit } from "@/lib/charity/impact";
import { platformConfig } from "@/config/platform";
import { quoteFromTyped, type Quote } from "@/lib/donations/quote";
import { CONTRIBUTION_EXPLAINER, NO_CONTRIBUTION_NOTE, contributionLabel, startingChoice, type ContributionChoice } from "@/lib/donations/contribution";

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
  /** The amount to start with: from a give link (?amount=250), a declined card's retry, or the charity's middle amount. */
  initialAmountCents?: number;
  /** A give link asked for a monthly gift (?monthly=1). Never for a campaign. */
  initialMonthly?: boolean;
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
  /** One agreement tick instead of the age tick and the Terms tick (platformConfig.checkout.singleAgreementTick). */
  singleAgreementTick?: boolean;
};

const noSubscribe = () => () => {};

/** The contribution buttons, from the config (never written into the page). */
const contributionPresets: readonly number[] = platformConfig.contributionPresetsCents;

function TickMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-current">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** As the donor would type it: 180, 180.50. */
const centsToInput = (c: number) => (c % 100 ? `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}` : String(c / 100));

/**
 * A dropped connection or a server error at Give stays on this page, with everything typed kept, and says plainly
 * that nothing was charged (the card is only ever entered on the payment page, so nothing can be charged before it
 * opens). Next's own redirect to the payment page still goes through.
 */
function offlineOrDown(e: unknown): { ok: false; message: string } {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return {
    ok: false,
    message: offline
      ? "You're offline, so your payment wasn't started. Nothing was charged. What you typed is still here. Check your connection and press Give again."
      : "We couldn't start your payment. Nothing was charged. What you typed is still here. Please try again in a minute.",
  };
}

export function DonateFlow({
  slug, charityName, receiptsAvailable, minimumLabel, suggestedCents = [], contributionMinimumLabel, initialLabel, initialAmountCents, initialMonthly = false,
  fromApp, campaign, account, source, impactUnit, cardChargeAvailable = false, singleAgreementTick = false,
}: Props) {
  // The amount, the contribution and the card charge box decide the live total, worked out as the donor types.
  const [amountText, setAmountText] = useState(initialAmountCents ? centsToInput(initialAmountCents) : "");
  const [picked, setPicked] = useState<number | null>(initialAmountCents && suggestedCents.includes(initialAmountCents) ? initialAmountCents : null);
  // The contribution to Givezy: the configured default preselected, or Other, or No thanks.
  const [contribChoice, setContribChoice] = useState<ContributionChoice>(() => startingChoice(contributionPresets, platformConfig.contributionDefaultCents));
  const [contributionText, setContributionText] = useState("");
  const [coverCharge, setCoverCharge] = useState(false);
  // An amount's problem shows once the donor leaves the box or presses Give, not while they are still typing "3" of "300".
  const [amountTouched, setAmountTouched] = useState(false);
  const [contributionTouched, setContributionTouched] = useState(false);
  const live = quoteFromTyped(amountText, contribChoice, contributionText, coverCharge);
  // When the server worked out a different total (the provider's rates changed since the page opened), its figures
  // are shown instead until the donor changes the amount again, so Give always sends the total on screen.
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);
  const quote = serverQuote ?? (live.ok ? live.quote : null);
  const changed = () => setServerQuote(null);
  const chooseContribution = (c: ContributionChoice) => {
    setContribChoice(c);
    changed();
    // Other opens the box to type in; what was typed there before is kept. Not when arrowing through the radios
    // with the keyboard: moving focus into the box would break the arrow keys out of the group.
    if (c === "other") requestAnimationFrame(() => {
      if (!(document.activeElement instanceof HTMLInputElement && document.activeElement.type === "radio")) contributionRef.current?.focus();
    });
  };

  const typedCents = parseRandToCents(amountText);
  // Only for an amount we can take: never a "pays for" line next to an amount the server will refuse.
  const typedImpact = impactUnit && typedCents && typedCents >= platformConfig.minDonationCents && typedCents <= platformConfig.maxDonationCents ? impactLine(typedCents, impactUnit) : null;
  const amountRef = useRef<HTMLInputElement>(null);
  const contributionRef = useRef<HTMLInputElement>(null);

  // A signed-in donor can reuse the ID number from their last s18A gift. Only its last four digits
  // reach the browser; the server fills in the number.
  const [useSavedId, setUseSavedId] = useState(Boolean(account?.savedIdLast4));
  const [state, dispatch, pending] = useActionState(
    async (prev: CheckoutState, fd: FormData): Promise<CheckoutState> => {
      const shown = fd.get("$shown");
      if (!shown) return prev;
      const q = JSON.parse(String(shown)) as Quote;
      fd.delete("$shown");
      try {
        const next = await submitDonation(slug, q.amountCents, q.contributionCents, q.cardChargeCents > 0, q.totalCents, fromApp, campaign?.id, prev, fd);
        if (next.quote) setServerQuote(next.quote);
        return { ...next, failedToStart: next.failedToStart ?? false };
      } catch (e) {
        return { ...offlineOrDown(e), failedToStart: true };
      }
    },
    { ok: false } as CheckoutState,
  );
  const [donorType, setDonorType] = useState<"individual" | "company" | "trust">("individual");
  const [want18a, setWant18a] = useState(false);
  // Take the gift first, the s18A details after (decided 04/11/2026). With a saved ID number, "now" is one tap less.
  const [s18aWhen, setS18aWhen] = useState<"now" | "later">(account?.savedIdLast4 ? "now" : "later");
  const [monthly, setMonthly] = useState(initialMonthly && !campaign);
  const org = donorType !== "individual";
  const monthlyOn = monthly && !campaign;
  const detailsNow = want18a && s18aWhen === "now";
  const idBoxesShown = org || !(account?.savedIdLast4 && useSavedId);
  const formRef = useRef<HTMLFormElement>(null);
  // Coming back from the payment provider (declined, Try again, Back) finds the details still filled in.
  useFormDraft(formRef, `donate:${slug}`);
  // Give works once the page has loaded: before that a press would send the form the browser's own way.
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  // The folded extras (label, dedication, message): open from the start when the app sent a label.
  const [extrasOpen, setExtrasOpen] = useState(Boolean(initialLabel));
  // How many things needed fixing at the last press of Give (the count is refreshed on the next press).
  const fixCount = Object.keys(state.fieldErrors ?? {}).length;
  const extrasNeedFixing = ["giving_label", "dedication_kind", "dedication_name", "message"].some((k) => Boolean(state.fieldErrors?.[k]));
  // After a refusal, take the donor to the first thing to fix (it may be far above the Give button).
  useEffect(() => {
    if (!state.fieldErrors) return;
    const first = formRef.current?.querySelector<HTMLElement>(FIX_TARGET);
    first?.focus();
    first?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [state]);

  const amountError = !live.ok && live.field === "amount" && amountTouched && !serverQuote ? live.message : null;
  const contributionError = !live.ok && live.field === "contribution" && contributionTouched && !serverQuote ? live.message : null;
  const total = quote ? formatRand(quote.totalCents) : null;

  return (
    <FormStateProvider state={state}>
      <form
        ref={formRef}
        noValidate
        method="post"
        className="space-y-5 rounded-[1.75rem] border-2 border-border bg-surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!quote) {
            // Nothing is sent with an amount we can't take: say what to fix, next to the box.
            setAmountTouched(true);
            setContributionTouched(true);
            (live.ok || live.field === "amount" ? amountRef : contributionRef).current?.focus();
            return;
          }
          const fd = new FormData(e.currentTarget);
          fd.set("$shown", JSON.stringify(quote));
          // The browser's Back from the payment provider's page returns here with the amount filled in.
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("cents", String(quote.amountCents));
            url.searchParams.delete("amount");
            if (monthly) url.searchParams.set("monthly", "1");
            else url.searchParams.delete("monthly");
            window.history.replaceState(window.history.state, "", url);
          } catch {
            // Only a convenience.
          }
          startTransition(() => dispatch(fd));
        }}
      >
        {source ? <input type="hidden" name={SOURCE_PARAM} value={source} /> : null}
        <label htmlFor="amount" className="block font-display text-2xl font-bold text-indigo">How much would you like to give?</label>
        {suggestedCents.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label={`Amounts suggested by ${charityName}`}>
            {suggestedCents.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setAmountText(centsToInput(c));
                  setPicked(c);
                  setAmountTouched(true);
                  changed();
                }}
                aria-pressed={picked === c}
                className={`rounded-2xl border-2 px-2 py-3 text-[17px] font-bold tabular-nums transition active:scale-95 ${picked === c ? "border-brand bg-brand text-white shadow-[0_8px_20px_rgba(23,73,181,0.25)]" : "border-border bg-surface text-navy hover:-translate-y-0.5 hover:border-brand"}`}
              >
                {formatRand(c)}
              </button>
            ))}
          </div>
        ) : null}
        <div>
          {suggestedCents.length ? <p className="mb-1 text-sm font-semibold text-navy">Or type your own amount</p> : null}
          <div className="flex min-w-0 items-center rounded-control border-2 border-border bg-surface px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft has-[[aria-invalid=true]]:border-danger">
            <span className="font-display text-2xl text-indigo">R</span>
            <input
              id="amount"
              ref={amountRef}
              name="amount"
              data-no-draft
              inputMode="decimal"
              autoComplete="off"
              required
              maxLength={16}
              value={amountText}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? "amount-error" : "amount-hint"}
              onChange={(e) => {
                setAmountText(e.target.value);
                const c = parseRandToCents(e.target.value);
                setPicked(c !== null && suggestedCents.includes(c) ? c : null);
                changed();
              }}
              onBlur={() => setAmountTouched(true)}
              className="min-w-0 flex-1 bg-transparent px-2 py-3 font-display text-2xl text-navy outline-none"
            />
          </div>
        </div>
        {amountError ? <p id="amount-error" role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger"><ErrorMark /><span>{amountError}</span></p> : null}
        {typedImpact && impactUnit && !amountError ? (
          <p className="rounded-control bg-honey-soft px-4 py-3 text-sm" aria-live="polite">
            <span className="font-semibold text-navy">{typedImpact}.</span> <span className="text-muted">{impactSource(charityName, impactUnit)}</span>
          </p>
        ) : null}
        {/* While the amount has a problem, its message says what to do; the hint comes back once it is fixed. */}
        {amountError ? null : <p id="amount-hint" className="text-sm text-muted">Minimum {minimumLabel}.</p>}

        {/* Gift amount, then the card charge, then the contribution, then the total (decided 09/11/2026). */}
        {cardChargeAvailable ? (
          <div className="rounded-control bg-honey-soft p-4">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm">
              <input
                type="checkbox"
                name="cover_card_charge"
                className="mt-0.5"
                checked={coverCharge}
                onChange={(e) => {
                  setCoverCharge(e.target.checked);
                  changed();
                }}
              />
              <span>Cover the card charge, so <bdi>{charityName}</bdi> gets your full donation. Optional. The total below includes it.</span>
            </label>
          </div>
        ) : null}

        {/* The contribution to Givezy: amount buttons, Other, and No thanks, one radio group (decided 09/11/2026).
            The preselected amount always shows as its own line in the total below, so it is never hidden. */}
        <fieldset className="space-y-3 rounded-control bg-honey-soft p-4" aria-describedby="contribution-about">
          <legend className="float-left w-full font-semibold text-navy">Contribution to Givezy</legend>
          <p id="contribution-about" className="clear-both text-sm text-muted">{CONTRIBUTION_EXPLAINER}</p>
          <div className="grid grid-cols-4 gap-2">
            {[...contributionPresets, "other" as const].map((c) => (
              <label
                key={c}
                className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-border bg-surface px-1 py-1.5 text-center font-bold tabular-nums text-navy transition hover:border-brand has-checked:border-brand has-checked:bg-brand has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-brand-soft"
              >
                <input
                  type="radio"
                  name="contribution_choice"
                  value={String(c)}
                  className="sr-only"
                  checked={contribChoice === c}
                  onChange={() => chooseContribution(c)}
                />
                {c === "other" ? <span className="text-[15px]">Other</span> : (
                  <>
                    <span className="text-[17px] leading-tight">{formatRand(c)}</span>
                    {/* The space keeps the label "R20 a month" for screen readers; a flex column doesn't show it. */}
                    {monthlyOn ? <>{" "}<span className="text-xs font-semibold leading-tight">a month</span></> : null}
                  </>
                )}
              </label>
            ))}
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold text-brand underline underline-offset-4 has-checked:no-underline has-checked:text-navy has-focus-visible:ring-4 has-focus-visible:ring-brand-soft">
            <input
              type="radio"
              name="contribution_choice"
              value="none"
              className="sr-only"
              checked={contribChoice === "none"}
              onChange={() => chooseContribution("none")}
            />
            {contribChoice === "none" ? <TickMark /> : null}
            No thanks
          </label>
          {contribChoice === "other" ? (
            <div>
              <label htmlFor="contribution" className="block text-sm font-medium">Your contribution to Givezy{monthlyOn ? ", each month" : ""}</label>
              <div className="mt-1 flex items-center rounded-[0.875rem] border-2 border-border bg-surface px-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft has-[[aria-invalid=true]]:border-danger">
                <span className="text-muted">R</span>
                <input
                  id="contribution"
                  ref={contributionRef}
                  name="contribution"
                  data-draft-controlled
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={16}
                  value={contributionText}
                  aria-invalid={contributionError ? true : undefined}
                  aria-describedby={contributionError ? "contribution-error" : "contribution-hint"}
                  onChange={(e) => {
                    setContributionText(e.target.value);
                    changed();
                  }}
                  onBlur={() => setContributionTouched(true)}
                  className="min-w-0 flex-1 bg-transparent px-2 py-2.5 outline-none"
                />
              </div>
              {contributionError ? (
                <p id="contribution-error" role="alert" className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-danger"><ErrorMark /><span>{contributionError}</span></p>
              ) : (
                <p id="contribution-hint" className="mt-1 text-xs text-muted">Any amount from {contributionMinimumLabel}.</p>
              )}
            </div>
          ) : null}
          {contribChoice === "none" ? <p className="text-sm text-muted" aria-live="polite">{NO_CONTRIBUTION_NOTE}</p> : null}
        </fieldset>

        {/* The total, always as it stands: it changes as the amount, the contribution or the card charge box changes. */}
        <div aria-live="polite">
          {quote ? <Breakdown q={quote} charityName={charityName} monthly={monthlyOn} /> : (
            <p className="rounded-control bg-honey-soft p-4 text-[15px] text-muted">
              {!live.ok && live.field === "contribution" ? "Your total shows here once the contribution above is fixed." : "Your total shows here once you choose an amount."}
            </p>
          )}
        </div>
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
          <TextField name="organisation_name" label={donorType === "trust" ? "Trust name" : "Company name"} required autoComplete="organization" maxLength={200} autoDirection />
          <TextField name="registration_number" label="Registration number" required={detailsNow} maxLength={40}
            hint={donorType === "trust" ? "The trust number from the Master of the High Court, for example IT1234/2015." : "The CIPC number, for example 2015/123456/07."} />
          <TextField name="contact_person" label="Contact person" required autoComplete="name" maxLength={120} autoDirection />
        </fieldset>
        <fieldset hidden={org} disabled={org} className="space-y-5">
          <TextField name="first_name" label="First name" required autoComplete="given-name" maxLength={80} autoDirection />
          <TextField name="last_name" label="Surname" required autoComplete="family-name" maxLength={80} autoDirection />
        </fieldset>
        <TextField name="email" label="Email" type="email" required autoComplete="email" defaultValue={account?.email} hint="Your confirmation goes here." maxLength={254} />

        {receiptsAvailable ? (
          <div className="space-y-3 rounded-control bg-honey-soft p-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
              <input type="checkbox" name="wants_18a" checked={want18a} onChange={(e) => setWant18a(e.target.checked)} />
              <span>I&apos;d like an s18A receipt</span>
            </label>
            <Info terms={["s18a"]} label="an s18A receipt" />
            {/* Hidden, not removed, so unticking and ticking again keeps what was typed. Disabled, it isn't sent. */}
            <fieldset hidden={!want18a} disabled={!want18a} className="space-y-3">
              <p className="text-sm text-muted">
                You&apos;ll get one s18A receipt for all your donations to <bdi>{charityName}</bdi> each tax year. SARS needs {org ? "the registration number" : "your SA ID number"} and {org ? "the registered" : "your"} address on it.
              </p>
              <fieldset className="space-y-1 text-sm">
                <legend className="sr-only">When to add your s18A details</legend>
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input type="radio" name="s18a_when" value="later" checked={s18aWhen === "later"} onChange={() => setS18aWhen("later")} />
                  Add my details after paying
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2">
                  <input type="radio" name="s18a_when" value="now" checked={s18aWhen === "now"} onChange={() => setS18aWhen("now")} />
                  Add them now
                </label>
              </fieldset>
              {s18aWhen === "later" ? (
                <p className="rounded-control bg-surface p-3 text-sm text-navy">
                  After paying, you add {org ? "the registration number" : "your SA ID number"} and address on the thank-you page, or later from your Givezy account. Until then this gift can&apos;t go on your s18A receipt.
                </p>
              ) : null}
              <fieldset hidden={!detailsNow} disabled={!detailsNow} className="space-y-3">
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
                            and Give's "take me to it" lands on these words. */}
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
                    <TextField name="id_number" label="SA ID number" required={detailsNow && !org} inputMode="numeric" hint="13 digits. SARS needs it to match your s18A receipt to you." maxLength={17} />
                  </fieldset>
                  <TextField name="tax_reference" label="Income tax number" inputMode="numeric" maxLength={10} hint="10 digits, if you have one." />
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">{org ? "Registered address" : "Your address"}</legend>
                  <p className="text-xs text-muted">
                    SARS needs it on the receipt.
                    {!org && account?.savedIdLast4 && useSavedId ? " Leave it empty to use the address from your last s18A gift." : ""}
                  </p>
                  {/* Required unless the saved address from the last s18A gift fills it in. */}
                  <TextField name="address_line1" label="Street address" required={!(account?.savedIdLast4 && useSavedId && !org)} autoComplete="address-line1" maxLength={200} />
                  <TextField name="address_line2" label="Unit, complex or building" autoComplete="address-line2" maxLength={200} />
                  <TextField name="suburb" label="Suburb" autoComplete="address-level3" maxLength={80} />
                  <TextField name="city" label="City or town" required={!(account?.savedIdLast4 && useSavedId && !org)} autoComplete="address-level2" maxLength={80} />
                  <TextField name="postal_code" label="Postal code" required={!(account?.savedIdLast4 && useSavedId && !org)} inputMode="numeric" autoComplete="postal-code" maxLength={4} />
                </fieldset>
              </fieldset>
            </fieldset>
          </div>
        ) : (
          <p className="rounded-control bg-warning-soft p-4 text-sm font-semibold text-warning">
            <bdi>{charityName}</bdi> is not s18A-approved, so this donation won&apos;t get a tax receipt.
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
              hint="Only you see it, in your giving records. For example: Work giving, Family, or Birthday."
            />

            <Dedicate error={state.fieldErrors?.dedication_name} />

            <TextArea name="message" label={`Message to ${charityName}`} rows={3} maxLength={500} />
          </div>
        </details>

        {/* Campaign gifts are once-off: a monthly gift would carry on after the campaign ends. */}
        {campaign ? null : <div className="space-y-2 rounded-control bg-honey-soft p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
            <input type="checkbox" name="monthly" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />
            <span>{total ? `Give ${total} every month` : "Give every month"}</span>
          </label>
          {monthly ? (
            <>
              <p className="text-sm text-muted">
                Your first payment is today. After that we collect the same amount on this day of each month (the last day, in shorter months) from the same card, until you cancel. Card payments only.
                You can pause or cancel at any time in the Givezy app or from your account on this website.
              </p>
              {quote && quote.totalCents !== quote.amountCents ? <p className="text-sm text-muted">{monthlyParts(quote, charityName)}</p> : null}
              {quote ? (
                <Check key={quote.totalCents} name="monthly_authorised" error={state.fieldErrors?.monthly_authorised}>
                  I authorise Givezy to collect {formatRand(quote.totalCents)} from my card every month until I cancel.
                </Check>
              ) : <p className="text-sm text-muted">Choose an amount above to authorise the monthly payments.</p>}
            </>
          ) : null}
        </div>}

        <h2 className="border-t-2 border-border pt-5 font-display text-2xl font-bold">Before you give</h2>
        <div className="space-y-3">
          <Check name="is_anonymous">
            Give anonymously. Your name won&apos;t appear on public pages, campaign lists or live totals.{" "}
            <span className="text-muted"><bdi>{charityName}</bdi> still sees your details, because it needs them to record your donation{receiptsAvailable ? " and issue your s18A receipt" : ""}.</span>
          </Check>
          <Check name="no_news">
            Don&apos;t send me news or appeals from <bdi>{charityName}</bdi>. <span className="text-muted">You&apos;ll still get your confirmation{receiptsAvailable ? " and s18A receipt" : ""}.</span>
          </Check>
          {singleAgreementTick ? (
            <Check name="agreement" error={state.fieldErrors?.agreement}>
              I&apos;m 18 or older{org ? " and allowed to give on behalf of this organisation," : ""} and I agree to <TermsAndPrivacyLinks />, and that my details are shared with <bdi>{charityName}</bdi> so they
              can record my donation.
            </Check>
          ) : (
            <>
              <Check name="age_confirmed" error={state.fieldErrors?.age_confirmed}>
                I am 18 or older{org ? ", and allowed to give on behalf of this organisation" : ""}.
              </Check>
              <Check name="popia_consent" error={state.fieldErrors?.popia_consent}>
                I agree to <TermsAndPrivacyLinks />, and that my details are shared with <bdi>{charityName}</bdi> so they can record my
                donation. Givezy keeps any label I give it privately, for my own records.
              </Check>
            </>
          )}
        </div>

        {/* Hidden from people; bots fill it in. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

        <button disabled={pending || !ready} className="pressable w-full rounded-control bg-coral px-4 py-3.5 text-lg font-bold text-navy disabled:opacity-60">
          {pending ? "Opening the secure payment page…" : !ready ? "Loading…" : total ? (monthly && !campaign ? `Give ${total} every month` : `Give ${total}`) : "Give"}
        </button>
        {pending ? <p role="status" className="text-center text-sm text-muted">Starting your payment. Nothing is charged until you confirm on the payment page.</p> : null}
        {state.message && !pending ? (
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
            {state.campaignEnded && quote ? (
              <a href={`/c/${slug}/donate?${new URLSearchParams({ cents: String(quote.amountCents), ...(fromApp ? { from: "app" } : {}), ...(source ? { [SOURCE_PARAM]: source } : {}), ...(initialLabel ? { label: initialLabel } : {}) }).toString()}`} className="inline-block font-bold text-brand underline underline-offset-4">
                Give {formatRand(quote.amountCents)} to <bdi>{charityName}</bdi> instead
              </a>
            ) : null}
          </div>
        ) : null}
        <p className="text-center text-sm text-muted">You&apos;ll enter your card details on the payment provider&apos;s secure page. We never see or store them.</p>
      </form>
    </FormStateProvider>
  );
}

/** The total, line by line. The contribution to Givezy always has its own line, R0 included, so a preselected amount is never hidden. */
function Breakdown({ q, charityName, monthly }: { q: Quote; charityName: string; monthly: boolean }) {
  return (
    <dl className="space-y-1.5 rounded-control bg-honey-soft p-4 text-[15px] tabular-nums">
      <div className="flex justify-between gap-3"><dt className="min-w-0">Donation to <bdi>{charityName}</bdi></dt><dd className="shrink-0">{formatRand(q.amountCents)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Contribution to Givezy</dt><dd className="shrink-0">{contributionLabel(q.contributionCents, monthly)}</dd></div>
      {q.cardChargeCents > 0 ? (
        <div className="flex justify-between gap-3"><dt className="min-w-0">Card charge, so <bdi>{charityName}</bdi> gets the full {formatRand(q.amountCents)}</dt><dd className="shrink-0">{formatRand(q.cardChargeCents)}</dd></div>
      ) : null}
      <div className="flex justify-between gap-3 border-t-2 border-border pt-2 text-lg font-bold"><dt>{monthly ? "Total each month" : "Total"}</dt><dd className="shrink-0">{formatRand(q.totalCents)}</dd></div>
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

/** The first thing to fix after Give: a field marked invalid, or a message that stands in for one (the saved ID number has no box). */
const FIX_TARGET = "[aria-invalid=true]:not(:disabled), [data-fix]";

/** What each monthly collection is made of, when it is more than the donation itself. */
function monthlyParts(q: { amountCents: number; contributionCents: number; cardChargeCents: number; totalCents: number }, charityName: string): string {
  const parts = [`${formatRand(q.amountCents)} to ${charityName}`];
  if (q.contributionCents > 0) parts.push(`${formatRand(q.contributionCents)} to Givezy`);
  if (q.cardChargeCents > 0) parts.push(`${formatRand(q.cardChargeCents)} card charge`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Each month's ${formatRand(q.totalCents)} is ${list}.`;
}

const charityLabel = (kind: "honour" | "memory") => (kind === "honour" ? "Shown as “In honour of” this person." : "Shown as “In memory of” this person.");
