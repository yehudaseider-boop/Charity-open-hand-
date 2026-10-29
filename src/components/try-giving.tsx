"use client";

import { useId, useState } from "react";
import { formatRand, parseRandToCents } from "@/lib/money";

/**
 * "Try it" on the home page: type an amount, switch monthly on or off, and see what it comes to over a year.
 * Nothing is sent anywhere. Givezy never suggests an amount of its own, so the box starts empty.
 */
export function TryGiving({ minCents }: { minCents: number }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [monthly, setMonthly] = useState(true);
  const cents = typed.trim() ? parseRandToCents(typed) : null;
  const tooSmall = cents !== null && cents < minCents;
  const tooBig = cents !== null && cents > 100_000_000;

  let line: React.ReactNode = <span className="text-muted">Type any amount to see what it adds up to.</span>;
  if (typed.trim() && cents === null) line = <span className="text-danger">Enter an amount in Rand, for example 180 or 180.50.</span>;
  else if (tooSmall) line = <span className="text-danger">The smallest donation is {formatRand(minCents)}.</span>;
  else if (tooBig) line = <span className="text-danger">That&apos;s more than we can show here.</span>;
  else if (cents !== null)
    line = monthly ? (
      <span><b>{formatRand(cents)}</b> every month is <b className="text-brand">{formatRand(cents * 12)}</b> over a year.</span>
    ) : (
      <span>One gift of <b className="text-brand">{formatRand(cents)}</b>. Set it to monthly to see a year.</span>
    );

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`${id}-amount`} className="text-[13px] font-semibold text-muted">Try it: your amount</label>
      <div className="flex items-center gap-2 rounded-xl border-2 border-brand bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-coral">
        <span className="font-display text-[1.25rem] font-bold text-navy">R</span>
        <input
          id={`${id}-amount`}
          inputMode="decimal"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value.slice(0, 12))}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent font-display text-[1.25rem] font-bold text-navy outline-none placeholder:text-border focus-visible:outline-none"
        />
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={monthly}
        onClick={() => setMonthly((m) => !m)}
        className="flex items-center justify-between rounded-xl px-1 py-1 text-[14px] font-semibold"
      >
        <span>Give every month</span>
        <span aria-hidden className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${monthly ? "bg-brand" : "bg-border"}`}>
          <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${monthly ? "translate-x-5" : ""}`} />
        </span>
      </button>
      <p aria-live="polite" className="min-h-[2.75rem] text-[14px] leading-snug">{line}</p>
    </div>
  );
}
