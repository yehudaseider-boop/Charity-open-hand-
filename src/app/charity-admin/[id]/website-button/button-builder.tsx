"use client";

import { useState } from "react";
import { blueAction, field as fieldClass, primaryAction } from "@/components/dash";
import { BUTTON_LABELS, BUTTON_STYLES, buttonHtml, buttonTarget, type ButtonLabel, type ButtonStyle } from "@/lib/charity/website-button";

type Campaign = { id: string; title: string };

/** Choose the button's look and where it goes, see it as donors will, and copy the code or the link. */
export function ButtonBuilder({ site, slug, charityName, campaigns }: { site: string; slug: string; charityName: string; campaigns: Campaign[] }) {
  const [style, setStyle] = useState<ButtonStyle>("blue");
  const [label, setLabel] = useState<ButtonLabel>("give");
  const [campaignId, setCampaignId] = useState("");
  const html = buttonHtml({ site, slug, charityName, style, label, campaignId: campaignId || null });
  const link = buttonTarget(site, slug, campaignId || null);

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Choice legend="Colour" name="style" options={BUTTON_STYLES} value={style} onChange={setStyle} />
        <Choice legend="Words on the button" name="label" options={BUTTON_LABELS} value={label} onChange={setLabel} />
      </div>
      {campaigns.length ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-navy">Where it goes</span>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={`${fieldClass} block w-full max-w-md`}>
            <option value="">Your Givezy page</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>Give to the campaign: {c.title}</option>
            ))}
          </select>
          {campaignId ? <span className="block text-xs text-muted">When the campaign ends, the button still works: donors are told it has ended and can still give to your charity.</span> : null}
        </label>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-navy">How it looks</p>
        {/* Shown on white and on a dark band, the two backgrounds charity websites mostly use. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-h-28 items-center justify-center rounded-card border-2 border-border bg-surface p-5" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="flex min-h-28 items-center justify-center rounded-card bg-navy p-5" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <p className="text-xs text-muted">Press it to try it: it opens your page in a new tab, the way your donors will see it.</p>
      </div>

      <CopyBox title="1. Copy the button code" note="Paste it into your website (steps below)." text={html} button="Copy code" multiline primary />
      <CopyBox title="Or copy just the link" note="For your own button, an email, a newsletter or your CRM. It opens only your charity on Givezy." text={link} button="Copy link" />
    </div>
  );
}

function Choice<T extends string>({ legend, name, options, value, onChange }: { legend: string; name: string; options: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold text-navy">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((k) => (
          <label key={k} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 px-4 text-[15px] transition focus-within:border-brand ${value === k ? "border-brand bg-honey-soft font-semibold text-brand" : "border-border bg-surface hover:border-brand hover:text-brand"}`}>
            <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} className="accent-[var(--brand)]" />
            {options[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CopyBox({ title, note, text, button, multiline, primary }: { title: string; note: string; text: string; button: string; multiline?: boolean; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  };
  const field = "block w-full min-w-0 rounded-control border-2 border-border bg-surface px-3 py-2 font-mono text-xs text-navy transition focus:border-brand";
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="text-sm text-muted">{note}</p>
      </div>
      {multiline ? (
        <textarea readOnly value={text} rows={5} onFocus={(e) => e.currentTarget.select()} aria-label={title} className={`${field} resize-y break-all`} />
      ) : (
        <input readOnly value={text} onFocus={(e) => e.currentTarget.select()} aria-label={title} className={field} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className={primary ? primaryAction : blueAction}>
          {state === "copied" ? "Copied" : button}
        </button>
        <p role="status" className="text-sm text-muted">
          {state === "copied" ? "Copied. Now paste it where you need it." : state === "failed" ? "Your browser didn't let us copy. Tap the box, select everything and copy it yourself." : ""}
        </p>
      </div>
    </div>
  );
}
