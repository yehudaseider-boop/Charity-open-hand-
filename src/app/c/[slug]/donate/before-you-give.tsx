"use client";

import { useState } from "react";
import { TermsAndPrivacyLinks } from "@/components/legal";
import { choicesSummary } from "@/lib/donations/choices-summary";
import { Check } from "./check";

/**
 * The give form's last step (simplified 12/11/2026, Yehuda: four ticks felt like too much). The two optional
 * choices (give anonymously, no news or appeals) share one folded row and stay unticked; the one agreement
 * tick stays in view, last before Give. A closed row still sends its boxes, shows what was chosen, and opens
 * by itself when a refusal comes back with something chosen.
 */
export function BeforeYouGive({ charityName, receiptsAvailable, org, singleAgreementTick, fieldErrors }: {
  charityName: string;
  receiptsAvailable: boolean;
  /** A company or trust gives: the age tick also says they may give for the organisation. */
  org: boolean;
  singleAgreementTick: boolean;
  fieldErrors?: Record<string, string>;
}) {
  const [anonymous, setAnonymous] = useState(false);
  const [noNews, setNoNews] = useState(false);
  const [open, setOpen] = useState(false);
  // After a refusal, anything chosen stays in view (the page also takes the donor to the first thing to fix). Done
  // while rendering, when the refusal changes: only a new refusal reopens the row, not every later tick.
  const [seenErrors, setSeenErrors] = useState(fieldErrors);
  if (fieldErrors !== seenErrors) {
    setSeenErrors(fieldErrors);
    if (fieldErrors && (anonymous || noNews)) setOpen(true);
  }
  const summary = choicesSummary({ anonymous, noNews });
  return (
    <>
      <h2 className="border-t-2 border-border pt-5 font-display text-2xl font-bold">Before you give</h2>
      <div className="space-y-3">
        <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-control border-2 border-border open:pb-3">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-navy">Your choices <span className="font-normal text-muted">(optional)</span></span>
              <span className="text-sm text-muted">{summary ?? "Give anonymously, or opt out of news and appeals"}</span>
            </span>
            <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 stroke-brand transition-transform group-open:rotate-180">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="space-y-3 px-4 pt-1">
            <Check name="is_anonymous" checked={anonymous} onCheckedChange={setAnonymous}>
              Give anonymously. Your name won&apos;t appear on public pages, campaign lists or live totals.{" "}
              <span className="text-muted"><bdi>{charityName}</bdi> still sees your details, because it needs them to record your donation{receiptsAvailable ? " and issue your s18A receipt" : ""}.</span>
            </Check>
            <Check name="no_news" checked={noNews} onCheckedChange={setNoNews}>
              Don&apos;t send me news or appeals from <bdi>{charityName}</bdi>. <span className="text-muted">You&apos;ll still get your confirmation{receiptsAvailable ? " and s18A receipt" : ""}.</span>
            </Check>
          </div>
        </details>
        {singleAgreementTick ? (
          <Check name="agreement" error={fieldErrors?.agreement}>
            I&apos;m 18 or older{org ? " and allowed to give on behalf of this organisation," : ""} and I agree to <TermsAndPrivacyLinks />, and that my details are shared with <bdi>{charityName}</bdi> so they
            can record my donation.
          </Check>
        ) : (
          <>
            <Check name="age_confirmed" error={fieldErrors?.age_confirmed}>
              I am 18 or older{org ? ", and allowed to give on behalf of this organisation" : ""}.
            </Check>
            <Check name="popia_consent" error={fieldErrors?.popia_consent}>
              I agree to <TermsAndPrivacyLinks />, and that my details are shared with <bdi>{charityName}</bdi> so they can record my
              donation. Givezy keeps any label I give it privately, for my own records.
            </Check>
          </>
        )}
      </div>
    </>
  );
}
