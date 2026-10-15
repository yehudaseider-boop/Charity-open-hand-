import { z } from "zod";
import { parseRandToCents } from "@/lib/money";

/** A charity's new campaign, as typed. The goal is required: it is what donors watch fill up. */
export const campaignSchema = z.object({
  title: z.string().trim().min(3, "Give it a short name, at least 3 letters").max(80, "Keep the name to 80 characters"),
  description: z.string().trim().max(500, "Keep it to 500 characters").optional(),
  target: z.string().trim().min(1, "Enter the goal in Rand, for example 50000"),
  ends_on: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").optional(),
});

export type CampaignInput = { title: string; description: string | null; targetCents: number; endsAt: string | null };

/**
 * Check a new campaign. `today` is Johannesburg's date as yyyy-mm-dd. The campaign ends at the end of
 * its last day, Johannesburg time.
 */
export function checkCampaign(raw: Record<string, string | undefined>, today: string):
  | { ok: true; value: CampaignInput }
  | { ok: false; fieldErrors: Record<string, string> } {
  const parsed = campaignSchema.safeParse(raw);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  const targetCents = parseRandToCents(raw.target ?? "");
  if (!fieldErrors.target && (targetCents === null || targetCents < 100)) fieldErrors.target = "Enter the goal in Rand, for example 50000";
  if (raw.ends_on && !fieldErrors.ends_on && raw.ends_on < today) fieldErrors.ends_on = "Choose today or a later date";
  if (!parsed.success || Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      targetCents: targetCents!,
      endsAt: parsed.data.ends_on ? `${parsed.data.ends_on}T23:59:59+02:00` : null,
    },
  };
}

/** A short web address part from the name, made unique with a few random characters. */
export function campaignSlug(title: string, random: string): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return `${base || "campaign"}-${random.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
}

/** How far along a campaign is, as a whole percentage for the bar (0 to 100). */
export function progressPercent(raisedCents: number, targetCents: number | null): number {
  if (!targetCents || targetCents <= 0) return 0;
  return Math.min(100, Math.floor((raisedCents * 100) / targetCents));
}
