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
  thank: "Prepare a thank-you for this month's donors",
  // With donors' names switched on (24/11/2026).
  newDonors: "Who gave for the first time this month?",
  stopped: "Who stopped their monthly donation?",
  s18aMissing: "Who asked for an s18A receipt and still has details missing?",
  topDonors: "Who are my top donors?",
} as const;

/**
 * The questions shown when the chat is empty. `canDraft`: the person may email donors, so a live charity is also
 * offered a thank-you to prepare (24/11/2026). `names`: donors' names are switched on, so a live charity is also
 * offered questions about donors by name (24/11/2026).
 */
export function startingSuggestions(live: boolean, canDraft = false, names = false): string[] {
  if (!live) return [Q.setup, Q.logo, Q.team, Q.goLive, Q.receiptsHow];
  return names
    ? [Q.thisMonth, ...(canDraft ? [Q.thank] : []), Q.newDonors, Q.stopped, Q.s18aMissing, Q.monthly]
    : [Q.thisMonth, ...(canDraft ? [Q.thank] : []), Q.monthly, Q.receiptsLeft, Q.recent, Q.team];
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
  donor_giving: [Q.topDonors, Q.newDonors, Q.recent],
  donor_list: [Q.newDonors, Q.stopped, Q.s18aMissing],
  donor_contact: [Q.recent, Q.thisMonth, Q.monthly],
  prepare_thank_you: [Q.thisMonth, Q.monthly, Q.receiptsLeft],
  prepare_thank_you_to_donor: [Q.thisMonth, Q.newDonors, Q.monthly],
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

/**
 * The markers the server puts at the very end of an answer: a prepared thank-you's button (24/11/2026, only when Givy
 * prepared one), then which lookups ran. Only read at the very end, after everything the model wrote, so a marker the
 * model writes itself is never taken for ours.
 */
export const NEXT_MARK = /\n*(?:\[\[thanks:([a-z0-9:=_-]{1,80})\]\]\n)?\[\[next:([a-z_,]*)\]\]\s*$/;

/** A half-arrived marker (or two), at the very end of an answer still streaming in. */
const PARTIAL_MARK = /\n*\[(?:\[(?:t(?:h(?:a(?:n(?:k(?:s(?::[a-z0-9:=_-]*(?:\](?:\](?:\n(?:\[(?:\[(?:n(?:e(?:x(?:t(?::[a-z_,]*\]?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?|n(?:e(?:x(?:t(?::[a-z_,]*\]?)?)?)?)?)?)?$/;

/**
 * Splits the markers off a (possibly still arriving) answer. A half-arrived marker is hidden too. `thanks` is the
 * prepared thank-you's marker value ("d=<draft id>" or "to=<audience>"), for thanksHref; null when there is none.
 */
export function splitNext(text: string): { text: string; tools: string[] | null; thanks: string | null } {
  const m = NEXT_MARK.exec(text);
  if (m) return { text: text.slice(0, m.index), tools: m[2].split(",").filter((t) => t in AFTER), thanks: m[1] ?? null };
  // While streaming, the markers can arrive in pieces: never show "[[ne..." or "[[thanks:..." to the reader.
  const partial = PARTIAL_MARK.exec(text);
  return { text: partial ? text.slice(0, partial.index) : text, tools: null, thanks: null };
}

/** The marker for these lookups (names only, from our own tool list). */
export function nextMark(tools: string[]): string {
  const names = [...new Set(tools.filter((t) => /^[a-z_]+$/.test(t)))];
  return `\n[[next:${names.join(",")}]]`;
}
