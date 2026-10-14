"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** While a payment is still being confirmed, check again every few seconds (up to about a minute). */
export function KeepChecking() {
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
  return (
    <p className="mt-2 text-xs text-muted" aria-live="polite">
      {tries < 12 ? "Checking again automatically…" : "Still waiting. Please refresh this page in a few minutes."}
    </p>
  );
}
