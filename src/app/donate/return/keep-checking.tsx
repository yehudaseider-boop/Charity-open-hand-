"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * While a payment is still being confirmed, check again every few seconds (up to about a minute).
 * After that, say plainly that closing the payment page without paying charged nothing, and offer to try again.
 */
export function KeepChecking({ retryHref }: { retryHref: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 12) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, 5_000);
    return () => clearTimeout(t);
  }, [tries, router]);
  if (tries < 12) {
    return <p className="mt-2 flex items-center gap-2 text-sm text-muted" aria-live="polite"><span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-coral" />Checking again automatically…</p>;
  }
  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      <p className="text-sm">
        Your payment hasn&apos;t come through yet. If you paid, it can take a few minutes: refresh this page later, and your confirmation email will follow.
        If you closed the payment page without paying, nothing was charged.
      </p>
      <Link href={retryHref} className="inline-block rounded-control border-2 border-border px-5 py-2.5 font-bold text-brand hover:border-brand">
        I didn&apos;t pay: try again
      </Link>
    </div>
  );
}
