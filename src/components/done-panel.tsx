import Link from "next/link";
import { undoCharityAction } from "@/app/charity-admin/[id]/undo-action";
import { loadAction, undoFailureText, type UndoFailure } from "@/lib/charity/charity-actions";
import { canUndo, describeDone, describeUndone, minutesLeft, pageOf, PANEL_HOURS } from "@/lib/charity/done";
import { formatDate } from "@/lib/dates";
import { FocusOnArrive, UndoButton } from "./done-panel-parts";

/**
 * A key for the page's forms: a new one after each action and after each Undo, so the form shows the
 * saved values from the server rather than what was typed.
 */
export function formKey(sp: Record<string, string | string[] | undefined>, fallback = "form"): string {
  if (sp.undone) return `undone-${String(sp.undone)}`;
  if (sp.done) return `done-${String(sp.done)}`;
  return fallback;
}

type Props = {
  charity: { id: string; slug: string; status: string };
  /** The page's search params: `done` (an action just went through) or `undone` (it was taken back). */
  sp: Record<string, string | string[] | undefined>;
  /** The page to come back to after "Undo", with its step if it has one. */
  here: string;
};

/**
 * The charity dashboard's core flow (18/10/2026): after every action, what just happened, a way to
 * take it back, and the one thing to do next. Shown at the top of the page the action came from.
 */
export async function DonePanel({ charity, sp, here }: Props) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const undoneId = one(sp.undone);
  const doneId = one(sp.done);
  const id = undoneId ?? doneId;
  if (!id) return null;
  const row = await loadAction(charity.id, id);
  if (!row) return null;
  // Only on the page the action came from, and only around the time it happened.
  const page = here.split("?")[0].split("/")[3] ?? "";
  if (pageOf(row.kind) !== page) return null;
  const now = new Date();
  if (now.getTime() - new Date(row.created_at).getTime() > PANEL_HOURS * 3_600_000) return null;
  const base = `/charity-admin/${charity.id}`;
  const ctx = { base, publicUrl: `/c/${charity.slug}`, approved: charity.status === "approved" };

  // Taken back (now or earlier): say so, whatever the link says, so an old "done" link never claims it's still in place.
  if (undoneId || row.undone_at) {
    return (
      <FocusOnArrive label="What just happened" className="rounded-card border border-border bg-honey-soft p-4 text-sm">
        <p className="font-medium text-navy">{describeUndone(row.kind, row.details)}</p>
      </FocusOnArrive>
    );
  }

  const done = describeDone(row.kind, row.details, ctx);
  const failed = one(sp.undo_failed) as UndoFailure | undefined;
  const undoable = canUndo(row, now);
  return (
    <FocusOnArrive label="What just happened" className="space-y-3 rounded-card border border-border bg-brand-soft p-4 text-sm">
      <p className="flex items-start gap-2 font-medium text-navy">
        <span aria-hidden className="text-success">✓</span>
        <span>{done.what}</span>
      </p>
      <p className="text-xs text-muted">Done at {timeOf(row.created_at)} on {formatDate(row.created_at)}.</p>
      {failed ? <p className="text-danger">Couldn&apos;t take it back. {undoFailureText(failed)}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {done.next ? (
          <Link href={done.next.href} className="pressable rounded-control bg-coral px-4 py-2.5 font-bold text-navy">
            {done.next.label}
          </Link>
        ) : null}
        {undoable && !failed ? (
          <form action={undoCharityAction.bind(null, charity.id, row.id, here)} className="flex flex-wrap items-center gap-2">
            <UndoButton />
            <span className="text-xs text-muted">You can take this back for {minutesLeft(row.created_at, now)} more {minutesLeft(row.created_at, now) === 1 ? "minute" : "minutes"}.</span>
          </form>
        ) : null}
      </div>
    </FocusOnArrive>
  );
}

const timeOf = (iso: string) => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
