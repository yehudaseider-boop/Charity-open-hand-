/**
 * What the account page says after a donor pauses, resumes or cancels a monthly donation (11/11/2026): what just
 * happened, the way to take it back where there is one, and what happens next. Pure and dependency-free.
 */

export type MonthlyChange = "paused" | "resumed" | "cancelled" | "removed";

/** The `?monthly=` value the account page is sent back with: one of the changes above, or "error". */
export function monthlyChangeFor(status: string, wasFailed: boolean): MonthlyChange | null {
  if (status === "paused") return "paused";
  if (status === "active") return "resumed";
  if (status === "cancelled") return wasFailed ? "removed" : "cancelled";
  return null;
}

export function isMonthlyChange(value: unknown): value is MonthlyChange {
  return value === "paused" || value === "resumed" || value === "cancelled" || value === "removed";
}

export type MonthlyResult = {
  /** What just happened, read as `${lead} to <charity name>${end}` (the name is left out when unknown). */
  lead: string;
  end: string;
  /** What happens next. */
  next: string;
  /** The status that takes it back, with its button label, or null when it can't be taken back. */
  undo: { status: "active" | "paused"; label: string } | null;
};

/** The message for a change. `nextDate` (already dd/mm/yyyy) comes from the monthly donation as it now stands, if known. */
export function monthlyResult(change: MonthlyChange, nextDate: string | null): MonthlyResult {
  switch (change) {
    case "paused":
      return { lead: "Paused your monthly donation", end: ".", next: "Nothing will be collected until you resume it.", undo: { status: "active", label: "Resume" } };
    case "resumed":
      return {
        lead: "Resumed your monthly donation",
        end: ".",
        next: nextDate ? `The next donation is on ${nextDate}.` : "The next donation goes on its usual day of the month.",
        undo: { status: "paused", label: "Pause" },
      };
    case "cancelled":
      return {
        lead: "Cancelled your monthly donation",
        end: ".",
        next: "Nothing more will be collected and your card is forgotten. To give every month again, start a new monthly donation on the charity's page.",
        undo: null,
      };
    case "removed":
      return { lead: "Removed the stopped monthly donation", end: " from your list.", next: "Nothing more will be collected.", undo: null };
  }
}

/** The whole sentence as plain text (for tests and screen readers' sake the page renders the same words). */
export function monthlyResultTitle(r: MonthlyResult, charityName: string | null): string {
  const name = charityName?.replace(/\s+/g, " ").trim();
  return `${r.lead}${name ? ` to ${name}` : ""}${r.end}`;
}
