"use client";

import { useState } from "react";
import { resetDemo } from "./store";

/** Puts the whole demo back as it started (asks first): for presenting it again, or to another charity. */
export function DemoReset() {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" onClick={() => setAsking(true)} className="ml-1 inline-flex min-h-11 items-center font-semibold text-brand underline">Reset the demo</button>;
  }
  return (
    <span role="alertdialog" aria-label="Please confirm" className="mt-2 flex flex-wrap items-center gap-3">
      <span className="font-medium">Put everything back as it started? What you added in this browser goes.</span>
      <button
        type="button"
        autoFocus
        onClick={() => {
          resetDemo();
          window.location.reload();
        }}
        className="pressable inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-brand-contrast"
      >
        Yes, reset
      </button>
      <button type="button" onClick={() => setAsking(false)} className="min-h-11 px-2 font-medium text-brand underline">Not yet</button>
    </span>
  );
}
