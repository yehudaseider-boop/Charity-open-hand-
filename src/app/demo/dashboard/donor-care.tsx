"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Card } from "@/components/card";
import { blueAction, field, secondaryAction } from "@/components/dash";
import { formatDate } from "@/lib/dates";
import { demoCareSeed, type DemoCare } from "./care";

/**
 * The donor page's follow-ups, tags and notes in the public demo, working as they do in the real dashboard, but
 * kept only in this visitor's browser: nothing is saved on Givezy or sent anywhere. "Put back the sample" restores
 * what the demo started with.
 */

const keyFor = (donorId: string) => `givezy-demo-care:${donorId}`;
const newId = () => Math.random().toString(36).slice(2, 10);
const dateLabel = (day: string) => formatDate(`${day}T12:00:00+02:00`);
/** Now, as dd/mm/yyyy hh:mm in Johannesburg time (built from parts: the browser's own en-ZA order is yyyy/mm/dd). */
function nowLabel(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

const noSubscribe = () => () => {};

/** What this browser kept for the donor, or the sample when it kept nothing (or something unreadable). */
function parse(raw: string | null, seed: DemoCare): DemoCare {
  if (!raw) return seed;
  try {
    const v = JSON.parse(raw) as DemoCare;
    return Array.isArray(v.notes) && Array.isArray(v.tags) && Array.isArray(v.followUps) ? v : seed;
  } catch {
    return seed;
  }
}

export function DemoDonorCare({ donorId, donorIndex, today, tagSuggestions }: { donorId: string; donorIndex: number; today: string; tagSuggestions: string[] }) {
  // What this browser kept, read once the page is in the browser (the server shows the sample).
  const kept = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return window.localStorage.getItem(keyFor(donorId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [edited, setCare] = useState<DemoCare | null>(null);
  const care = edited ?? parse(kept, demoCareSeed(donorIndex, today));
  const [status, setStatus] = useState("");
  const [stored, setStored] = useState(true);

  function save(next: DemoCare, said: string) {
    setCare(next);
    try {
      window.localStorage.setItem(keyFor(donorId), JSON.stringify(next));
      setStored(true);
      setStatus(`${said} Kept in this browser only; nothing is sent.`);
    } catch {
      // Private browsing or blocked storage: it still works on this page, it just won't be there after a reload.
      setStored(false);
      setStatus(`${said} This browser won't keep it after you leave the page.`);
    }
  }

  const open = care.followUps.filter((f) => !f.doneAt).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const done = care.followUps.filter((f) => f.doneAt);

  return (
    <>
      <p role="status" aria-live="polite" className={status ? "rounded-card bg-success-soft p-3 text-sm text-success" : "sr-only"}>{status}</p>

      <Card title={`Follow-ups${open.length ? ` (${open.length})` : ""}`}>
        <div className="space-y-3 text-sm">
          {open.length === 0 ? <p className="text-muted">Nothing to follow up. Add one below, for example a call to say thank you.</p> : null}
          <ul className="space-y-2">
            {open.map((f) => (
              <li key={f.id} className={`rounded-control border-2 p-3 ${f.dueOn <= today ? "border-warning bg-warning-soft" : "border-border"}`}>
                <p className="font-medium [overflow-wrap:anywhere]">{f.what}</p>
                <p className="text-xs text-muted">{f.dueOn < today ? "Was due" : f.dueOn === today ? "Due today" : "Due"} {dateLabel(f.dueOn)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={secondaryAction} onClick={() => save({ ...care, followUps: care.followUps.map((x) => (x.id === f.id ? { ...x, doneAt: nowLabel() } : x)) }, "Marked as done.")}>Done</button>
                  <button
                    type="button"
                    className={secondaryAction}
                    onClick={() => window.confirm("Remove this follow-up? It can't be undone.") && save({ ...care, followUps: care.followUps.filter((x) => x.id !== f.id) }, "Follow-up removed.")}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {done.length ? (
            <details>
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand hover:underline">Done recently ({done.length})</summary>
              <ul className="mt-2 space-y-2">
                {done.map((f) => (
                  <li key={f.id} className="rounded-control border-2 border-border p-3 text-muted">
                    <p className="line-through [overflow-wrap:anywhere]">{f.what}</p>
                    <p className="text-xs">Done {f.doneAt}</p>
                    <button type="button" className={`${secondaryAction} mt-2`} onClick={() => save({ ...care, followUps: care.followUps.map((x) => (x.id === f.id ? { ...x, doneAt: null } : x)) }, "Put back as not done.")}>Undo</button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <FollowUpForm today={today} onAdd={(what, dueOn) => save({ ...care, followUps: [...care.followUps, { id: newId(), what, dueOn, doneAt: null }] }, "Follow-up added.")} />
        </div>
      </Card>

      <Card title="Tags">
        <div className="space-y-3 text-sm">
          {care.tags.length ? (
            <ul className="flex flex-wrap gap-2">
              {care.tags.map((t) => (
                <li key={t} className="flex max-w-full items-center gap-1 rounded-full border-2 border-border bg-honey-soft py-1 pl-3 pr-1">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
                  <button type="button" className="min-h-11 rounded-full px-3 font-semibold text-brand hover:underline" onClick={() => save({ ...care, tags: care.tags.filter((x) => x !== t) }, `"${t}" taken off.`)}>Take off</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No tags yet. Tags are your own labels, for finding donors later (Donors, filter by tag).</p>
          )}
          <TagForm
            suggestions={tagSuggestions.filter((t) => !care.tags.includes(t))}
            onAdd={(name) => (care.tags.some((t) => t.toLowerCase() === name.toLowerCase()) ? setStatus(`"${name}" is already on this donor.`) : save({ ...care, tags: [...care.tags, name] }, `"${name}" added.`))}
          />
        </div>
      </Card>

      <Card title={`Notes${care.notes.length ? ` (${care.notes.length})` : ""}`}>
        <div className="space-y-3 text-sm">
          <NoteForm label="Add a note" submit="Save note" onSave={(body) => save({ ...care, notes: [{ id: newId(), body, at: nowLabel(), editedAt: null }, ...care.notes] }, "Note saved.")} />
          <ul className="space-y-3">
            {care.notes.map((n) => (
              <li key={n.id} className="rounded-control border-2 border-border p-3">
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <p className="mt-1 text-xs text-muted">You (demo), {n.at}{n.editedAt ? ` (edited ${n.editedAt})` : ""}</p>
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer content-center font-semibold text-brand hover:underline">Edit or remove</summary>
                  <div className="mt-2 space-y-2">
                    <NoteForm label="Edit the note" submit="Save changes" defaultBody={n.body} onSave={(body) => save({ ...care, notes: care.notes.map((x) => (x.id === n.id ? { ...x, body, editedAt: nowLabel() } : x)) }, "Note changed.")} />
                    <button type="button" className={secondaryAction} onClick={() => window.confirm("Remove this note? It can't be undone.") && save({ ...care, notes: care.notes.filter((x) => x.id !== n.id) }, "Note removed.")}>Remove note</button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <p className="text-xs text-muted">
        In this demo, notes, tags and follow-ups stay in your own browser{stored ? "" : " (this browser isn't keeping them)"}.{" "}
        <button type="button" className="min-h-11 font-semibold text-brand underline" onClick={() => { try { window.localStorage.removeItem(keyFor(donorId)); } catch {} setCare(demoCareSeed(donorIndex, today)); setStatus("The sample for this donor is back."); }}>Put back the sample</button>
      </p>
    </>
  );
}

function NoteForm({ label, submit, defaultBody = "", onSave }: { label: string; submit: string; defaultBody?: string; onSave: (body: string) => void }) {
  const id = useId();
  const [body, setBody] = useState(defaultBody);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const text = body.trim();
        if (!text) return setError("Write something first.");
        setError("");
        onSave(text.slice(0, 2000));
        if (!defaultBody) setBody("");
      }}
    >
      <label htmlFor={id} className="block font-semibold text-navy">{label}</label>
      <textarea id={id} rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} className={`${field} w-full py-2`} aria-describedby={`${id}-hint`} aria-invalid={error ? true : undefined} />
      <p id={`${id}-hint`} className="text-xs text-muted">Only people who manage your charity on Givezy see notes. Donors can ask what&apos;s held about them, so write what you&apos;d be happy for them to read.</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" className={blueAction}>{submit}</button>
    </form>
  );
}

function FollowUpForm({ today, onAdd }: { today: string; onAdd: (what: string, dueOn: string) => void }) {
  const id = useId();
  const [what, setWhat] = useState("");
  const [due, setDue] = useState(today);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!what.trim()) return setError("Say what to do.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return setError("Choose a date.");
        setError("");
        onAdd(what.trim().slice(0, 300), due);
        setWhat("");
        setDue(today);
      }}
    >
      <label htmlFor={`${id}-what`} className="block font-semibold text-navy">What to do</label>
      <input id={`${id}-what`} value={what} maxLength={300} onChange={(e) => setWhat(e.target.value)} className={`${field} w-full`} placeholder="For example: call to say thank you" />
      <label htmlFor={`${id}-due`} className="block font-semibold text-navy">When</label>
      <input id={`${id}-due`} type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div><button type="submit" className={blueAction}>Add follow-up</button></div>
    </form>
  );
}

function TagForm({ suggestions, onAdd }: { suggestions: string[]; onAdd: (name: string) => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const t = name.trim().replace(/\s+/g, " ");
        if (!t) return setError("Type a tag first.");
        setError("");
        onAdd(t.slice(0, 40));
        setName("");
      }}
    >
      <label htmlFor={id} className="block font-semibold text-navy">Tag</label>
      <input id={id} value={name} maxLength={40} list={`${id}-list`} onChange={(e) => setName(e.target.value)} className={`${field} w-full`} aria-describedby={`${id}-hint`} />
      <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <p id={`${id}-hint`} className="text-xs text-muted">{suggestions.length ? `Type a new tag, or one you use already: ${suggestions.slice(0, 6).join(", ")}` : "For example Board member, Volunteer, Open day 2026"}</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" className={blueAction}>Add tag</button>
    </form>
  );
}
