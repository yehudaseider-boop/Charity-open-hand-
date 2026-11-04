/**
 * Give links that start the donor closer to the finish (decided 04/11/2026): `/c/<slug>/donate?amount=250`
 * preselects R250, and `&monthly=1` preselects a monthly gift. A charity makes them on its QR poster page.
 * A silly value (not a number, below the minimum, above the maximum) is ignored quietly: the page falls back
 * to its usual choice and never shows an error for a link. Pure and dependency-free.
 */
import { parseRandToCents } from "@/lib/money";

export type GiveLinkChoice = {
  /** The amount to preselect, in cents, or undefined for the page's usual choice. */
  amountCents?: number;
  /** Start with "Give every month" switched on. */
  monthly: boolean;
};

type Limits = { minDonationCents: number; maxDonationCents: number };

const one = (v: unknown): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s : undefined;
};

/** An amount in Rand as a link carries it ("250", or "180.50" from a phone that posted the box), checked against the limits. */
export function linkAmountCents(raw: unknown, limits: Limits): number | undefined {
  const s = one(raw);
  if (!s || s.length > 16) return undefined;
  const cents = parseRandToCents(s);
  if (cents === null || cents < limits.minDonationCents || cents > limits.maxDonationCents) return undefined;
  return cents;
}

/**
 * What a donate link asks for. `cents` is our own retry link's amount (whole cents, after a declined card);
 * `amount` is in Rand. `monthly=1` (or "yes", "true") asks for a monthly gift.
 */
export function readGiveLink(params: { amount?: unknown; cents?: unknown; monthly?: unknown }, limits: Limits): GiveLinkChoice {
  const centsRaw = one(params.cents);
  const fromCents = centsRaw && /^\d{1,12}$/.test(centsRaw) ? Number(centsRaw) : undefined;
  const amountCents =
    fromCents !== undefined && fromCents >= limits.minDonationCents && fromCents <= limits.maxDonationCents ? fromCents : linkAmountCents(params.amount, limits);
  const m = one(params.monthly)?.toLowerCase();
  return { amountCents, monthly: m === "1" || m === "yes" || m === "true" };
}

/**
 * A give link for a charity. The amount goes as whole Rand when it has no cents, so the link stays short and
 * readable ("?amount=250"). `src` tags where the link was shared (link, qr, whatsapp).
 */
export function giveLink(site: string, slug: string, choice: { amountCents?: number; monthly?: boolean; src?: string | null; campaign?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (choice.campaign) q.set("campaign", choice.campaign);
  if (choice.amountCents && choice.amountCents > 0) {
    const c = choice.amountCents;
    q.set("amount", c % 100 === 0 ? String(c / 100) : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`);
  }
  // A campaign gift is once-off, so a campaign link never asks for monthly.
  if (choice.monthly && !choice.campaign) q.set("monthly", "1");
  if (choice.src) q.set("src", choice.src);
  const query = q.toString();
  return `${site.replace(/\/+$/, "")}/c/${encodeURIComponent(slug)}/donate${query ? `?${query}` : ""}`;
}
