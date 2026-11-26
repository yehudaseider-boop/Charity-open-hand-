"use client";

import { useState } from "react";
import { GivePhone, NewGift, Receipt, ThankYouEmail, Where } from "@/components/landing/gift-story";
import { formatRand } from "@/lib/money";

/**
 * The home page's hero story, live (redesign preview, 26/11/2026): the donor's phone is real to tap. Pick an amount on it
 * and the gift goes round again with that amount: the charity sees it, the donor is thanked, and it is on the s18A
 * receipt. Made-up example; nothing is paid. Without motion (reduced motion) the cards simply change.
 */
export function TryAGift({ charity }: { charity: string }) {
  const [cents, setCents] = useState(25_000);
  const amount = formatRand(cents);
  return (
    <figure className="relative mx-auto w-full max-w-[36rem]">
      <figcaption className="sr-only">
        Try it: pick an amount on the phone. A {amount} gift to {charity} shows on the charity&apos;s dashboard straight away, the donor gets a thank-you email, and it is on their s18A receipt at tax time. Made-up example; nothing is paid.
      </figcaption>
      <p className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-white/85 sm:justify-start">
        <span aria-hidden className="tap-hint flex h-6 w-6 items-center justify-center rounded-full bg-coral text-[12px] text-navy">↓</span>
        Try it: tap an amount on the phone (nothing is paid)
      </p>
      <div className="relative grid items-start gap-6 sm:grid-cols-[15.5rem_minmax(0,1fr)]">
        <span aria-hidden className="absolute -right-10 top-4 h-72 w-72 rounded-full border-[40px] border-honey/25" />
        <div className="hero-rise relative mx-auto w-[15rem] sm:w-full" style={{ animationDelay: "120ms" }}>
          <Where n={1}>You give</Where>
          <GivePhone amountCents={cents} onPick={setCents} />
        </div>
        <div aria-hidden key={cents} className="relative flex flex-col gap-5">
          <div className="hero-rise sm:mr-6" style={{ animationDelay: "260ms" }}>
            <Where n={2}>They see it</Where>
            <NewGift amountCents={cents} />
          </div>
          <div className="hero-rise sm:ml-6" style={{ animationDelay: "460ms" }}>
            <Where n={3}>You&apos;re thanked</Where>
            <ThankYouEmail amountCents={cents} />
          </div>
          <div className="hero-rise sm:mr-10" style={{ animationDelay: "660ms" }}>
            <Where n={4}>Tax time, sorted</Where>
            <Receipt amountCents={cents} />
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{`${amount}: the charity sees it, you're thanked, and it's on your s18A receipt.`}</p>
    </figure>
  );
}
