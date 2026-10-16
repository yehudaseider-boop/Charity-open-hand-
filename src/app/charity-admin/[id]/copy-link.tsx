"use client";

import { useState } from "react";

/** The charity's public link, with a button that copies it. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-control border border-border bg-surface px-3 py-2">{url}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        className="rounded-control border border-border px-3 py-2"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
