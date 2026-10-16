/**
 * Group challenges (16/10/2026): a donor starts one for a charity, shares the link, and friends give.
 * Pure rules, tested: what a starter may type, the challenge's web address, and how full the ring is.
 */
import { z } from "zod";
import { campaignSlug } from "@/lib/charity/campaigns";
import { parseRandToCents } from "@/lib/money";

export const challengeSchema = z.object({
  starter_name: z.string().trim().min(1, "Enter the name to show, for example your first name").max(40, "Keep it to 40 characters"),
  title: z.string().trim().min(3, "Give it a short name, at least 3 letters").max(80, "Keep the name to 80 characters"),
  reason: z.string().trim().max(500, "Keep it to 500 characters").optional(),
  target: z.string().trim().min(1, "Enter the goal in Rand, for example 10000"),
  ends_on: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").optional(),
});

export type ChallengeInput = { starterName: string; title: string; reason: string | null; targetCents: number; endsAt: string | null };

/**
 * Check a new challenge. `today` is Johannesburg's date (yyyy-mm-dd); the challenge ends at the end of
 * its last day, Johannesburg time. The goal must be at least the smallest donation.
 */
export function checkChallenge(raw: Record<string, string | undefined>, today: string, minCents: number, minLabel: string):
  | { ok: true; value: ChallengeInput }
  | { ok: false; fieldErrors: Record<string, string> } {
  const parsed = challengeSchema.safeParse(raw);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  const targetCents = parseRandToCents(raw.target ?? "");
  if (!fieldErrors.target) {
    if (targetCents === null) fieldErrors.target = "Enter the goal in Rand, for example 10000";
    else if (targetCents < minCents) fieldErrors.target = `The goal must be at least ${minLabel}`;
    else if (targetCents > 100_000_000_000) fieldErrors.target = "Choose a smaller goal";
  }
  if (raw.ends_on && !fieldErrors.ends_on && raw.ends_on < today) fieldErrors.ends_on = "Choose today or a later date";
  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      starterName: parsed.data.starter_name,
      title: parsed.data.title,
      reason: parsed.data.reason || null,
      targetCents: targetCents!,
      endsAt: parsed.data.ends_on ? `${parsed.data.ends_on}T23:59:59+02:00` : null,
    },
  };
}

/** The challenge's web address part: from its name, with a few random characters to keep it unique. */
export function challengeSlug(title: string, random: string): string {
  const s = campaignSlug(title, random);
  return s.startsWith("campaign-") ? `challenge-${s.slice("campaign-".length)}` : s;
}

/** Taking gifts now: not stopped by the charity and not past its last day. */
export function challengeOpen(c: { status: string; endsAt: string | null }, now: Date = new Date()): boolean {
  return c.status === "active" && (!c.endsAt || new Date(c.endsAt).getTime() >= now.getTime());
}

/** How full the ring is, as a whole percentage. Past the goal it can go over 100 in words, never in the ring. */
export function ringPercent(raisedCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.floor((raisedCents * 100) / targetCents);
}

/** The milestone worth sharing, if any: halfway, or the goal reached. */
export function milestone(raisedCents: number, targetCents: number): "goal" | "halfway" | null {
  const pct = ringPercent(raisedCents, targetCents);
  return pct >= 100 ? "goal" : pct >= 50 ? "halfway" : null;
}

/** The WhatsApp message for sharing a challenge: what it's for and the link. Never anyone's amount. */
export function challengeShareText(c: { title: string; charityName: string; raisedCents: number; targetCents: number }, url: string, rand: (cents: number) => string): string {
  const m = milestone(c.raisedCents, c.targetCents);
  const lead = m === "goal" ? `We did it: "${c.title}" reached its goal of ${rand(c.targetCents)} for ${c.charityName}.` : m === "halfway" ? `We're halfway: "${c.title}" for ${c.charityName}.` : `Join "${c.title}" for ${c.charityName}.`;
  return `${lead} ${url}`;
}
