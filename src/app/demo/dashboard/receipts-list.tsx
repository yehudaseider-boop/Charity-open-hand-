"use client";

import { useState } from "react";
import { Card } from "@/components/card";
import { blueAction, secondaryAction } from "@/components/dash";
import { formatRand } from "@/lib/money";
import { plural } from "@/lib/text";
import { DEMO_CHARITY } from "./sample";
import { demoNow, useDemo } from "./store";

/**
 * The yearly s18A list in the public demo (25/11/2026: "the main thing you're selling to charities" had no buttons).
 * The same steps as the real page: open a receipt to see its preview, approve it, or approve them all (asking first),
 * with Undo. Everything stays in this visitor's browser: nothing is issued and no donor is emailed.
 */

export type DemoReceiptRow = { id: string; name: string; initials: string; totalCents: number; gifts: { date: string; cents: number }[] };

type Approved = { ids: string[]; at: string };
const SHOWN = 6;

export function DemoReceiptsList({ rows, taxYearName, endsOn }: { rows: DemoReceiptRow[]; taxYearName: string; endsOn: string }) {
  const [approved, setApproved] = useDemo<Approved>("receipts-approved", { ids: [], at: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  // What the last action approved, so Undo takes back only that (QA 26/11/2026: Undo after "Approve all" also took back
  // approvals made one by one before it).
  const [last, setLast] = useState<string[]>([]);
  const left = rows.filter((r) => !approved.ids.includes(r.id));
  const total = rows.reduce((t, r) => t + r.totalCents, 0);
  const approve = (ids: string[], said: string) => {
    const fresh = ids.filter((id) => !approved.ids.includes(id));
    setApproved({ ids: [...approved.ids, ...fresh], at: demoNow() });
    setLast(fresh);
    setNote(said);
    setAsking(false);
  };
  /** Takes back these approvals only; nothing had been sent. */
  const takeBack = (ids: string[], said: string) => {
    const rest = approved.ids.filter((id) => !ids.includes(id));
    setApproved({ ids: rest, at: rest.length ? approved.at : "" });
    setLast([]);
    setNote(said);
  };
  const undo = () => takeBack(last, last.length === 1 ? "Approval taken back. Nothing had been sent." : `${plural(last.length, "approval")} taken back. Nothing had been sent.`);
  /** "Kagiso M." already ends with a full stop: never "Kagiso M..". */
  const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

  return (
    <Card lights title={`Yearly list for the ${taxYearName} tax year`}>
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          In your real dashboard this list opens once the tax year ends on {endsOn}. The demo lets you try it now: open a receipt to see its preview, approve it, or
          approve them all. Givezy signs the list off after you, and then each donor gets their receipt by email. Here nothing is issued and no one is emailed.
        </p>
        <p className="font-medium text-indigo" role="status">
          {left.length} to check · {approved.ids.length} approved
        </p>
        {note ? (
          <p role="status" className="rounded-control bg-success-soft p-3 font-medium text-navy">
            {note}{" "}
            {last.length > 0 ? <button type="button" onClick={undo} className="min-h-11 font-bold text-brand underline underline-offset-4">Undo</button> : null}
          </p>
        ) : null}
        {/* Approve all sits above the list here (the real page has it below): 48 rows is a long way to scroll to try it. */}
        {left.length > 0 ? (
          asking ? (
            <div role="alertdialog" aria-label="Please confirm" className="space-y-2 rounded-control border-2 border-border p-3">
              <p className="font-medium">
                Approve {plural(left.length, "receipt")}, {formatRand(left.reduce((t, r) => t + r.totalCents, 0))} in all? In your real dashboard, Givezy then checks the list and
                signs it off. You can take your approval back until then.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" autoFocus onClick={() => approve(left.map((r) => r.id), `Approved ${plural(left.length, "receipt")}.`)} className={blueAction}>Yes, approve all</button>
                <button type="button" onClick={() => setAsking(false)} className="min-h-11 px-2 font-medium text-brand underline">Not yet</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className={blueAction}>Approve all {left.length} ({formatRand(left.reduce((t, r) => t + r.totalCents, 0))})</button>
          )
        ) : (
          <p className="font-medium text-indigo">
            All {rows.length} approved, {formatRand(total)} in all. In your real dashboard, Givezy checks and signs off the list, and then each donor gets their receipt by email.
          </p>
        )}
        <ul className="divide-y divide-border">
          {(all ? rows : rows.slice(0, SHOWN)).map((r) => {
            const done = approved.ids.includes(r.id);
            const showing = open === r.id;
            return (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-honey text-[11px] font-bold text-navy">{r.initials}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold" dir="auto">{r.name}</span>
                      <span className="block text-xs text-muted">{plural(r.gifts.length, "donation")} · {formatRand(r.totalCents)}{done ? " · approved" : ""}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" aria-expanded={showing} onClick={() => setOpen(showing ? null : r.id)} className={secondaryAction}>
                      {showing ? "Close preview" : "Preview"}
                    </button>
                    {done ? (
                      <>
                        <span className="inline-flex min-h-11 items-center px-2 font-semibold text-success">Approved</span>
                        <button type="button" onClick={() => takeBack([r.id], sentence(`Approval taken back for ${r.name}`) + " Nothing had been sent.")} className="min-h-11 px-2 font-medium text-brand underline underline-offset-4">
                          Take back
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => approve([r.id], sentence(`Approved the receipt for ${r.name}`))} className={blueAction}>Approve</button>
                    )}
                  </span>
                </div>
                {showing ? <SamplePreview row={r} taxYearName={taxYearName} /> : null}
              </li>
            );
          })}
        </ul>
        {rows.length > SHOWN ? (
          <button type="button" onClick={() => setAll(!all)} className="min-h-11 font-semibold text-brand underline underline-offset-4">
            {all ? "Show fewer" : `Show all ${rows.length} donors`}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/** A sample of what one donor's receipt shows: made-up donor, no real numbers. */
function SamplePreview({ row, taxYearName }: { row: DemoReceiptRow; taxYearName: string }) {
  return (
    <div className="mt-3 space-y-2 rounded-control border-2 border-dashed border-border bg-honey-soft p-4">
      <p className="text-xs font-bold text-muted">Sample preview, not a real receipt</p>
      <p className="font-display text-lg font-bold text-indigo">s18A receipt, {taxYearName} tax year</p>
      <p>
        <span className="text-muted">From </span><bdi className="font-semibold">{DEMO_CHARITY.name_en}</bdi>
        <span className="text-muted"> to </span><bdi className="font-semibold">{row.name}</bdi>
      </p>
      <ul className="divide-y divide-border">
        {row.gifts.map((g, i) => (
          <li key={i} className="flex justify-between gap-3 py-1.5">
            <span>{g.date}</span>
            <span className="tabular-nums">{formatRand(g.cents)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 py-1.5 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatRand(row.totalCents)}</span>
        </li>
      </ul>
      <p className="text-xs text-muted">Donations only, never a contribution to Givezy. The real receipt is a PDF in your charity&apos;s name, with the details SARS needs.</p>
    </div>
  );
}
