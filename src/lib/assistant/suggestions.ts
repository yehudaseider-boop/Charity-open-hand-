/**
 * Givy's suggested questions (22/11/2026, Yehuda: "yes"). Pure, so the panel and the tests share it.
 *
 * - Starting questions fit the charity's stage: while it isn't live yet, setting up comes first; once it is live,
 *   its donations do.
 * - After each answer, up to three follow-ups fit what was just looked up (the server says which lookups ran, at the
 *   very end of the answer, as `[[next:tool,tool]]`). Every follow-up is one of our own fixed questions, never
 *   written by the model, and none is offered twice in one chat.
 */

const Q = {
  thisMonth: "How much came in this month?",
  lastMonths: "How does that compare to the last few months?",
  setup: "What's left to set up?",
  monthly: "How are my monthly donations doing?",
  retrying: "Are any monthly donations being retried?",
  nextCollections: "When are the next monthly collections?",
  receiptsHow: "How do s18A receipts work?",
  receiptsLeft: "How many gifts still need an s18A receipt?",
  recent: "What were my most recent gifts?",
  team: "How do I add someone to my team?",
  logo: "How do I add my logo?",
  goLive: "What happens once we're approved?",
} as const;

/** The questions shown when the chat is empty. */
export function startingSuggestions(live: boolean): string[] {
  return live
    ? [Q.thisMonth, Q.monthly, Q.receiptsLeft, Q.recent, Q.team]
    : [Q.setup, Q.logo, Q.team, Q.goLive, Q.receiptsHow];
}

/** What to offer after an answer that used each lookup, best first. */
const AFTER: Record<string, string[]> = {
  giving_totals: [Q.lastMonths, Q.monthly, Q.receiptsLeft],
  giving_by_month: [Q.thisMonth, Q.monthly, Q.recent],
  monthly_donations: [Q.nextCollections, Q.retrying, Q.thisMonth],
  setup_progress: [Q.logo, Q.team, Q.goLive],
  receipts_progress: [Q.receiptsHow, Q.thisMonth, Q.recent],
  recent_gifts: [Q.thisMonth, Q.monthly, Q.receiptsLeft],
  top_donors: [Q.recent, Q.monthly, Q.thisMonth],
  find_donor: [Q.recent, Q.thisMonth, Q.monthly],
};

/**
 * Up to `max` follow-ups for an answer that used these lookups, leaving out anything already asked in this chat.
 * With no lookups (a "how do I" answer from the guide), it falls back to the starting questions.
 */
export function followUps(tools: string[], asked: string[], live: boolean, max = 3): string[] {
  const seen = new Set(asked.map((a) => a.trim().toLowerCase()));
  const pool = [...tools.flatMap((t) => AFTER[t] ?? []), ...startingSuggestions(live)];
  const out: string[] = [];
  for (const q of pool) {
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q);
    if (out.length === max) break;
  }
  return out;
}

/** The marker the server puts at the very end of an answer: which lookups ran. */
export const NEXT_MARK = /\n*\[\[next:([a-z_,]*)\]\]\s*$/;

/** Splits the marker off a (possibly still arriving) answer. A half-arrived marker is hidden too. */
export function splitNext(text: string): { text: string; tools: string[] | null } {
  const m = NEXT_MARK.exec(text);
  if (m) return { text: text.slice(0, m.index), tools: m[1].split(",").filter((t) => t in AFTER) };
  // While streaming, the marker can arrive in pieces: never show "[[ne..." to the reader.
  const partial = /\n*\[\[(n(e(x(t(:[a-z_,]*)?)?)?)?)?$/.exec(text);
  return { text: partial ? text.slice(0, partial.index) : text, tools: null };
}

/** The marker for these lookups (names only, from our own tool list). */
export function nextMark(tools: string[]): string {
  const names = [...new Set(tools.filter((t) => /^[a-z_]+$/.test(t)))];
  return `\n[[next:${names.join(",")}]]`;
}
