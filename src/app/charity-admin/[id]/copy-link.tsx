"use client";

import { useRef, useState } from "react";

/** The charity's public link, with a button that copies it. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const linkRef = useRef<HTMLElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code ref={linkRef} className="min-w-0 flex-1 truncate rounded-control border border-border bg-surface px-3 py-2">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied("yes");
            setTimeout(() => setCopied(null), 2000);
          } catch {
            // The browser refused (walk-through, 25/11/2026: it failed silently): select the link to copy by hand.
            const el = linkRef.current;
            const sel = window.getSelection();
            if (el && sel) {
              const range = document.createRange();
              range.selectNodeContents(el);
              sel.removeAllRanges();
              sel.addRange(range);
            }
            setCopied("no");
          }
        }}
        className="inline-flex min-h-11 items-center rounded-control border border-border px-3"
      >
        {copied === "yes" ? "Copied" : "Copy link"}
      </button>
      <p role="status" className="basis-full text-sm text-muted empty:hidden">
        {copied === "yes" ? "Link copied." : copied === "no" ? "Your browser didn't let us copy it. The link is selected: copy it from there." : ""}
      </p>
    </div>
  );
}
