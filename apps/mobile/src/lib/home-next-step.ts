import type { Gift } from "../data/giving";

/**
 * The one thing Home's top card asks for (22/11/2026, Yehuda: "Home's prime spot is a picture with nothing to tap").
 * Someone who hasn't given through Givezy yet is pointed to a cause; someone who has is offered to give again to the
 * charity they gave to last, with that gift's amount and day. Pure.
 */
export type NextStep =
  /** Their giving hasn't loaded (or couldn't): no claim either way, just a way to a cause. */
  | { kind: "browse" }
  | { kind: "first" }
  | { kind: "again"; slug: string; charityName: string; cents: number; date: Date };

export function homeNextStep(gifts: Pick<Gift, "charitySlug" | "charityName" | "cents" | "date">[], known = true): NextStep {
  if (!known) return { kind: "browse" };
  const last = gifts.reduce<(typeof gifts)[number] | null>((a, g) => (!a || g.date > a.date ? g : a), null);
  return last ? { kind: "again", slug: last.charitySlug, charityName: last.charityName, cents: last.cents, date: last.date } : { kind: "first" };
}
