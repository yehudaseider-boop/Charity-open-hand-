/**
 * Turning the donor's own rows from the database into what the screens show.
 * Pure functions (no React Native), so the website's test suite can check them.
 */
import { DECLINED_REASON } from "@shared/donations/monthly-reasons";
import type { Gift, Receipt, Recurring } from "../data/giving";
import { cleanLabel, labelOf } from "@shared/donations/labels";
import { jhbDay } from "./format";

export type DonationRow = {
  id: string;
  paid_at: string | null;
  status: string;
  amount_cents: number | string;
  wants_18a: boolean;
  recurring_id: string | null;
  charities: { slug: string; name_en: string; thank_you_en?: string | null } | { slug: string; name_en: string; thank_you_en?: string | null }[] | null;
};
export type KindRow = { donation_id: string; kind?: string | null; label?: string | null };
export type RecurringRow = {
  id: string;
  amount_cents: number | string;
  /** The donor's extra gift to Givezy, collected with each month. */
  contribution_cents?: number | string | null;
  status: string;
  needs_gateway_sync?: boolean;
  /** Tries this month that the card declined (more to come, or it stopped after three). */
  failed_attempts?: number | null;
  /** Why it stopped (read only to tell a declined card, which can be replaced, from a new card that can't be used monthly). */
  ended_reason?: string | null;
  next_charge_at: string | null;
  charities: { slug: string; name_en: string } | { slug: string; name_en: string }[] | null;
};
export type ReceiptRow = {
  id: string;
  tax_year: number;
  amount_cents: number | string;
  issued_at: string;
  status: string;
  reference: string | null;
  charity_name: string | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * Paid donations only: they are what counts towards the donor's goals.
 * (Refunded or charged-back donations drop out; pending ones aren't money yet.)
 * Each carries the donor's own label, if they gave one (old maaser/chomesh/tzedaka choices read as labels).
 */
export function toGifts(donations: DonationRow[], kinds: KindRow[]): Gift[] {
  const labelFor = new Map(kinds.map((k) => [k.donation_id, labelOf(k)]));
  return donations
    .filter((d) => d.status === "paid" && d.paid_at)
    .map((d) => {
      const c = one(d.charities);
      return {
        id: d.id,
        date: jhbDay(new Date(d.paid_at!)),
        at: new Date(d.paid_at!),
        charitySlug: c?.slug ?? "",
        charityName: c?.name_en ?? "Charity",
        cents: Number(d.amount_cents),
        monthly: d.recurring_id !== null,
        with18a: d.wants_18a,
        label: labelFor.get(d.id) ?? null,
        ...(c?.thank_you_en ? { thankYou: c.thank_you_en } : {}),
      };
    })
    .sort((a, b) => momentOf(b) - momentOf(a));
}

/** When a gift was paid, to the moment where known (live), else its day. */
const momentOf = (g: Gift) => (g.at ?? g.date).getTime();

export function toRecurring(rows: RecurringRow[]): Recurring[] {
  return rows
    // Cancelled ones only show while the payment provider hasn't yet stopped them. A failed one stays so the donor sees why it stopped.
    .filter((r) => r.status === "active" || r.status === "paused" || r.status === "failed" || (r.status === "cancelled" && r.needs_gateway_sync === true))
    .map((r) => {
      const c = one(r.charities);
      return {
        id: r.id,
        charitySlug: c?.slug ?? "",
        charityName: c?.name_en ?? "Charity",
        cents: Number(r.amount_cents),
        contributionCents: Number(r.contribution_cents ?? 0),
        nextDate: r.next_charge_at ? jhbDay(new Date(r.next_charge_at)) : null,
        status: r.status as "active" | "paused" | "cancelled" | "failed",
        syncing: r.needs_gateway_sync === true,
        ...((r.status === "failed" && r.ended_reason === DECLINED_REASON) || (r.status === "active" && Number(r.failed_attempts ?? 0) > 0) ? { needsCard: true } : {}),
      };
    });
}

export function toReceipts(rows: ReceiptRow[]): Receipt[] {
  return rows
    .filter((r) => r.status === "issued")
    .map((r) => ({
      id: r.id,
      taxYear: r.tax_year,
      charityName: r.charity_name ?? "Charity",
      number: r.reference ?? "",
      cents: Number(r.amount_cents),
      issued: jhbDay(new Date(r.issued_at)),
    }));
}

/** A sensible-looking email address (the server checks properly). */
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** The 6-digit code from the sign-in email, ignoring spaces. */
export function cleanCode(v: string): string | null {
  const c = v.replace(/\s/g, "");
  return /^\d{6}$/.test(c) ? c : null;
}

/**
 * Donations that arrived since the donor last looked, to thank them for.
 * The first time (nothing seen yet) nothing is new: we don't celebrate history.
 */
export type Seen = { ids: string[]; since: string | null };

export function newArrivals(gifts: Gift[], seen: Seen | null): Gift[] {
  if (seen === null) return [];
  const ids = new Set(seen.ids);
  const since = seen.since ? new Date(seen.since).getTime() : -Infinity;
  // Strictly newer than the oldest remembered one: anything at or before it was already seen.
  return gifts.filter((g) => momentOf(g) > since && !ids.has(g.id)).sort((a, b) => momentOf(a) - momentOf(b));
}

/** What to remember as seen: the newest 200 donations, and the date of the oldest of them. */
export function seenFrom(gifts: Gift[]): Seen {
  const newest = [...gifts].sort((a, b) => momentOf(b) - momentOf(a)).slice(0, 200);
  return { ids: newest.map((g) => g.id), since: newest.length ? new Date(momentOf(newest[newest.length - 1])).toISOString() : null };
}

/**
 * The last giving the phone loaded, kept on the phone so the app opens straight
 * away and still shows history without signal. Dates go in as ISO strings and
 * every field is checked on the way back in; anything odd means no cache.
 */
export type Cached = { gifts: Gift[]; recurring: Recurring[]; receipts: Receipt[]; elsewhere: { id: string; date: Date; recipient: string; cents: number; label: string | null }[]; loadedAt: Date };

export function toCache(live: Cached): string {
  // Kept small: the newest 500 donations, without the charities' thank-you notes.
  const gifts = [...live.gifts]
    .sort((a, b) => momentOf(b) - momentOf(a))
    .slice(0, 500)
    .map(({ thankYou: _note, ...g }) => g);
  // Version 2: dates are Johannesburg calendar days, with the exact moment kept as `at`.
  return JSON.stringify({ v: 2, ...live, gifts });
}

export function fromCache(raw: string | null): Cached | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== 2) return null;
    const date = (v: unknown): Date => {
      const d = new Date(typeof v === "string" ? v : NaN);
      if (Number.isNaN(d.getTime())) throw new Error("bad date");
      return d;
    };
    const cents = (v: unknown): number => {
      if (!Number.isSafeInteger(v)) throw new Error("bad amount");
      return v as number;
    };
    const str = (v: unknown): string => {
      if (typeof v !== "string") throw new Error("bad text");
      return v;
    };
    // A label, or (saved by an earlier version) the old fixed choice.
    const label = (row: Record<string, unknown>): string | null =>
      row.label !== undefined ? cleanLabel(row.label) : labelOf({ kind: typeof row.kind === "string" ? row.kind : null });
    const list = (v: unknown): Record<string, unknown>[] => {
      if (!Array.isArray(v)) throw new Error("bad list");
      return v as Record<string, unknown>[];
    };
    return {
      gifts: list(o.gifts).map((g) => ({
        id: str(g.id),
        date: date(g.date),
        ...(g.at !== undefined ? { at: date(g.at) } : {}),
        charitySlug: str(g.charitySlug),
        charityName: str(g.charityName),
        cents: cents(g.cents),
        monthly: g.monthly === true,
        with18a: g.with18a === true,
        label: label(g),
        ...(typeof g.thankYou === "string" ? { thankYou: g.thankYou } : {}),
      })),
      recurring: list(o.recurring).map((r) => {
        const status = r.status === "active" || r.status === "paused" || r.status === "cancelled" || r.status === "failed" ? r.status : null;
        if (!status) throw new Error("bad status");
        return {
          id: str(r.id),
          charitySlug: str(r.charitySlug),
          charityName: str(r.charityName),
          cents: cents(r.cents),
          ...(r.contributionCents == null ? {} : { contributionCents: cents(r.contributionCents) }),
          nextDate: r.nextDate == null ? null : date(r.nextDate),
          status,
          ...(r.syncing === true ? { syncing: true } : {}),
          ...(r.needsCard === true ? { needsCard: true } : {}),
        };
      }),
      receipts: list(o.receipts).map((r) => ({
        id: str(r.id),
        taxYear: cents(r.taxYear),
        charityName: str(r.charityName),
        number: str(r.number),
        cents: cents(r.cents),
        issued: date(r.issued),
      })),
      elsewhere: list(o.elsewhere).map((e) => ({ id: str(e.id), date: date(e.date), recipient: str(e.recipient), cents: cents(e.cents), label: label(e) })),
      loadedAt: date(o.loadedAt),
    };
  } catch {
    return null;
  }
}
