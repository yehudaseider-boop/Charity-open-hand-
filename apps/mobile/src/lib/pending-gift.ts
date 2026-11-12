/**
 * A gift we haven't heard the end of, kept on the phone so it survives the app being closed (12/11/2026).
 *
 * Two cases. A payment that was started (our server gave it a reference and a check token) but not yet confirmed
 * as paid, declined or not found: the payment page may still be open, or the phone may have closed the app while
 * it was. And a saved-card charge whose answer was lost before our server gave a reference: it is asked about again
 * under the same attempt id, so it can never be charged twice. One per charity, per person (see pending-gift-store).
 *
 * This file has no imports on purpose: the website's tests run it too.
 */

/** Exactly what one tap of Give sent: shown on the thank-you, and put back in the form while a saved-card charge is held. */
export type GiftSnapshot = {
  cents: number;
  contributionCents: number;
  email: string;
  monthly: boolean;
  label: string | null;
  amountText?: string;
  extraText?: string;
  extraChoice?: number | "other" | "none";
};

export type PendingGift = {
  slug: string;
  charityName: string;
  /** Our donation reference and the token that lets the phone ask about it (api/app/status). Null for a saved-card attempt with no answer yet. */
  reference: string | null;
  token: string | null;
  /** Charged to a saved card (no payment page). */
  charged: boolean;
  /** The saved-card attempt id, kept until the charge is known paid or declined. */
  attemptId: string | null;
  /** Asked for "Add my details after paying": the gift can't go on an s18A receipt until they are added. */
  detailsLater: boolean;
  summary: GiftSnapshot;
  /** When Give was tapped (ISO). */
  sentAt: string;
};

/** A month on, a gift nobody has heard of is dropped: by then it is in the donor's history, or it never happened. */
export const PENDING_KEEP_MS = 31 * 24 * 3_600_000;

const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const cents = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

function cleanSnapshot(v: unknown): GiftSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const c = cents(o.cents);
  const extra = cents(o.contributionCents);
  if (c === null || extra === null || typeof o.email !== "string") return null;
  const choice = o.extraChoice;
  return {
    cents: c,
    contributionCents: extra,
    email: o.email.slice(0, 320),
    monthly: o.monthly === true,
    label: str(o.label, 80),
    ...(typeof o.amountText === "string" ? { amountText: o.amountText.slice(0, 20) } : {}),
    ...(typeof o.extraText === "string" ? { extraText: o.extraText.slice(0, 20) } : {}),
    ...(choice === "other" || choice === "none" || cents(choice) !== null ? { extraChoice: choice as GiftSnapshot["extraChoice"] } : {}),
  };
}

/** One stored gift, or null when it is damaged, half there, or too old to matter. */
export function cleanPendingGift(v: unknown, now = new Date()): PendingGift | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const slug = str(o.slug);
  const summary = cleanSnapshot(o.summary);
  const sentAt = str(o.sentAt, 40);
  const reference = str(o.reference);
  const token = str(o.token);
  const attemptId = str(o.attemptId);
  if (!slug || !summary || !sentAt || Number.isNaN(Date.parse(sentAt))) return null;
  // Nothing to ask about: neither a payment with its token nor a saved-card attempt.
  if (!(reference && token) && !attemptId) return null;
  if (now.getTime() - Date.parse(sentAt) > PENDING_KEEP_MS) return null;
  return {
    slug,
    charityName: str(o.charityName) ?? "the charity",
    reference: reference && token ? reference : null,
    token: reference && token ? token : null,
    charged: o.charged === true,
    attemptId,
    detailsLater: o.detailsLater === true,
    summary,
    sentAt,
  };
}

/** Every gift in the stored record that is still worth asking about, keyed by charity. */
export function cleanPendingGifts(v: unknown, now = new Date()): Record<string, PendingGift> {
  const out: Record<string, PendingGift> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const g of Object.values(v as Record<string, unknown>)) {
    const p = cleanPendingGift(g, now);
    if (p) out[p.slug] = p;
  }
  return out;
}

/** What the server's answer does to a stored gift: settled (forget it) or still waiting (keep it). */
export function settles(outcome: string): boolean {
  return outcome === "paid" || outcome === "failed" || outcome === "not_found" || outcome === "reversed";
}

/**
 * Whether the donor's giving history already has this gift (our reference is the donation's id), so a goal ring
 * or a streak never counts it twice. `firstOnly`: it is the only gift there, so it was their first.
 */
export function inHistory(history: readonly { id: string }[], reference: string | null | undefined): { counted: boolean; firstOnly: boolean } {
  const counted = Boolean(reference) && history.some((g) => g.id === reference);
  return { counted, firstOnly: counted && history.every((g) => g.id === reference) };
}
