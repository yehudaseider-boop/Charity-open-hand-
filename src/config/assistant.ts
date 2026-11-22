/**
 * The dashboard help assistant ("Ask Givezy", 21/11/2026, Yehuda: "help charities use the dashboard"). It answers
 * "how do I" questions from our own dashboard guide (src/lib/assistant/guide.ts) and points to the right page. It can't
 * see a charity's data or change anything. The ONLY place its settings live.
 *
 * Since 22/11/2026 (Yehuda: "answer questions based off what's going on their dashboard, and help set up the account")
 * it can also look up the charity's own figures and setup steps, read-only and as the person asking
 * (src/lib/assistant/tools.ts).
 *
 * Three switches, all off by default:
 * - ASSISTANT=yes (and ANTHROPIC_API_KEY set) turns it on in the real charity dashboard.
 * - ASSISTANT_DEMO=yes also shows it on the public demo dashboard (/demo/dashboard), with tighter limits.
 * - ASSISTANT_DONOR_DATA=yes lets it look up donors by name (top donors, find a donor, names on recent gifts). Their
 *   names and amounts then go to Anthropic with the question: switch on only once Yosef has approved the Privacy
 *   Policy wording and Yehuda has signed it off (go-live list). Never contact, ID or bank details either way.
 */
export const assistantConfig = {
  /** Claude model. Change only with Yehuda's yes (cost). */
  model: "claude-opus-5-5",
  /** How hard it thinks: "low" keeps answers quick and cheap; help answers come from the guide, not reasoning. */
  effort: "low" as const,
  /**
   * Most tokens per reply, thinking included (thinking is always on for this model). The words themselves are kept
   * short by the instructions; this only stops a reply being cut off mid-thought (review 21/11/2026).
   */
  maxAnswerTokens: 4000,
  /** Lookups per question (each is one more round with the model), and how long one round may take. */
  maxToolRounds: 4,
  roundTimeoutMs: 40_000,
  /** The whole answer, every round included: under the route's maxDuration (120 s), so it always ends with a message. */
  answerDeadlineMs: 100_000,
  /** What one question may be: characters, and how many earlier turns are sent with it. */
  maxQuestionChars: 800,
  maxTurns: 12,
  /** Earlier answers sent back: at most this many characters each, and this many for the whole history. */
  maxAnswerChars: 1500,
  maxHistoryChars: 8000,
  /** Questions allowed: per signed-in person per hour, per charity per day. */
  perPersonPerHour: 30,
  perCharityPerDay: 200,
  /** The public demo: per visitor per hour, and for all demo visitors together per day. */
  demoPerVisitorPerHour: 10,
  demoPerDay: 300,
} as const;

/** Whether the assistant is on for the real dashboard. */
export function assistantOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.ASSISTANT === "yes" && Boolean(env.ANTHROPIC_API_KEY);
}

/** Whether the assistant is also on for the public demo dashboard. */
export function assistantDemoOn(env: Record<string, string | undefined> = process.env): boolean {
  return assistantOn(env) && env.ASSISTANT_DEMO === "yes";
}

/** Whether the helper may look up donors by name (see the third switch above). */
export function assistantDonorDataOn(env: Record<string, string | undefined> = process.env): boolean {
  return assistantOn(env) && env.ASSISTANT_DONOR_DATA === "yes";
}
