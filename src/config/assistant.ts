/**
 * The dashboard help assistant ("Ask Givezy", 21/11/2026, Yehuda: "help charities use the dashboard"). It answers
 * "how do I" questions from our own dashboard guide (src/lib/assistant/guide.ts) and points to the right page. It can't
 * see a charity's data or change anything. The ONLY place its settings live.
 *
 * Two switches, both off by default:
 * - ASSISTANT=yes (and ANTHROPIC_API_KEY set) turns it on in the real charity dashboard.
 * - ASSISTANT_DEMO=yes also shows it on the public demo dashboard (/demo/dashboard), with tighter limits.
 */
export const assistantConfig = {
  /** Claude model. Change only with Yehuda's yes (cost). */
  model: "claude-opus-5-5",
  /** How hard it thinks: "low" keeps answers quick and cheap; help answers come from the guide, not reasoning. */
  effort: "low" as const,
  /** Longest answer, in tokens (about 1 100 words): answers are meant to be short. */
  maxAnswerTokens: 1500,
  /** What one question may be: characters, and how many earlier turns are sent with it. */
  maxQuestionChars: 800,
  maxTurns: 12,
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
