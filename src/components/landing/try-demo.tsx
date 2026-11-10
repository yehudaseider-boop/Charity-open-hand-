"use client";

import { useId, useState } from "react";
import { formatRand } from "@/lib/money";
import { DEMO_CAUSES, DEMO_PRESETS_CENTS, demoSummary, type DemoCause, type DemoFrequency } from "@/lib/landing-demo";

/**
 * "Try it" in the "I give" door (10/11/2026): pick an amount, once or every month, and a sample cause, and watch a
 * sample summary and s18A receipt build. A real form for keyboards and screen readers, but nothing is charged, stored
 * or sent: there is no submit. Its controls are blue and soft, so the screen's one orange button stays the only one.
 */
export function TryDemo({ now }: { now?: Date }) {
  const id = useId();
  const [amount, setAmount] = useState<string | null>(null); // a preset's cents as text, or "other"
  const [typed, setTyped] = useState("");
  const [frequency, setFrequency] = useState<DemoFrequency>("monthly");
  const [cause, setCause] = useState<DemoCause | null>(null);

  const result = demoSummary({
    amount: amount === null ? null : amount === "other" ? { kind: "other", typed } : { kind: "preset", cents: Number(amount) },
    frequency,
    cause,
    now: now ?? new Date(),
  });

  const chip =
    "flex min-h-12 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-white px-4 text-[16px] font-bold text-navy transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-contrast peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-coral";

  return (
    <form onSubmit={(e) => e.preventDefault()} aria-labelledby={`${id}-title`} className="flex flex-col gap-6 rounded-[1.75rem] border-[1.5px] border-border bg-white p-5 shadow-[0_24px_60px_rgba(14,27,61,0.08)] sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${id}-title`} className="font-display text-[1.375rem] font-bold">Try it</h3>
        <span className="rounded-full bg-honey-soft px-2.5 py-1 text-[12px] font-semibold text-brand">Sample, nothing is charged</span>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[15px] font-semibold">How much</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[...DEMO_PRESETS_CENTS.map((c) => String(c)), "other"].map((v) => (
            <label key={v} className="relative">
              <input type="radio" name="amount" value={v} checked={amount === v} onChange={() => setAmount(v)} className="peer sr-only" />
              <span className={chip}>{v === "other" ? "Other" : formatRand(Number(v))}</span>
            </label>
          ))}
        </div>
        {amount === "other" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-muted">Your amount in Rand</span>
            <span className="flex items-center gap-2 rounded-[1.125rem] border-2 border-brand bg-white px-4 focus-within:ring-4 focus-within:ring-brand-soft">
              <span aria-hidden className="font-display text-[1.25rem] font-bold">R</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value.slice(0, 12))}
                aria-invalid={result.kind === "error" ? true : undefined}
                className="h-12 min-w-0 flex-1 bg-transparent font-display text-[1.25rem] font-bold text-navy outline-none"
              />
            </span>
          </label>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-[15px] font-semibold">How often</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {(["once", "monthly"] as const).map((f) => (
            <label key={f} className="relative">
              <input type="radio" name="frequency" value={f} checked={frequency === f} onChange={() => setFrequency(f)} className="peer sr-only" />
              <span className={chip}>{f === "once" ? "Once" : "Every month"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
          A cause
          <span className="rounded-full bg-honey-soft px-2 py-0.5 text-[12px] font-semibold text-brand">Sample</span>
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {DEMO_CAUSES.map((c) => (
            <label key={c.id} className="relative">
              <input type="radio" name="cause" value={c.id} checked={cause === c.id} onChange={() => setCause(c.id)} className="peer sr-only" />
              <span className="flex min-h-14 cursor-pointer items-center rounded-[1.125rem] border-2 border-border bg-honey-soft px-4 text-[15px] font-semibold text-navy transition-colors peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-coral">
                {c.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-live="polite" className="min-h-[9.5rem]">
        {result.kind === "ready" ? (
          <div className="flex flex-col gap-3">
            <p className="sr-only">{result.summary}</p>
            <div aria-hidden className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] bg-brand p-4 text-white">
                <p className="text-[13px] opacity-80">{result.frequency === "monthly" ? "Every month" : "Once"}</p>
                <p className="font-display text-[2rem] font-extrabold leading-tight tabular-nums">{formatRand(result.cents)}</p>
                <p className="text-[13px] opacity-80">{result.perYearCents !== null ? `${formatRand(result.perYearCents)} a year` : `To ${result.cause.toLowerCase()}`}</p>
              </div>
              <div className="rounded-[1.25rem] border-2 border-dashed border-honey bg-white p-4">
                <p className="flex items-center justify-between gap-2 text-[13px] font-semibold text-muted">
                  <span>Your s18A receipt would show</span>
                  <span className="rounded-full bg-honey-soft px-2 py-0.5 text-[11px] text-brand">Sample</span>
                </p>
                <p className="font-display text-[2rem] font-extrabold leading-tight tabular-nums">{formatRand(result.receiptCents)}</p>
                <p className="text-[13px] text-muted">for the {result.taxYearName} tax year{result.frequency === "monthly" ? `: ${result.giftsThisTaxYear} monthly ${result.giftsThisTaxYear === 1 ? "gift" : "gifts"}, this month to ${result.lastMonth}` : ""}</p>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">Only charities approved for s18A receipts can issue them. This is a sample: nothing is charged and nothing is saved.</p>
          </div>
        ) : (
          <p className={`rounded-[1.25rem] px-4 py-5 text-[15px] ${result.kind === "error" ? "bg-danger-soft font-semibold text-danger" : "bg-honey-soft text-muted"}`}>{result.message}</p>
        )}
      </div>
    </form>
  );
}
