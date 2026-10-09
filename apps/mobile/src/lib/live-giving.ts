/**
 * Turning the donor's own rows from the database into what the screens show.
 * Pure functions (no React Native), so the website's test suite can check them.
 */
import type { Gift, GivingKind, Receipt, Recurring } from "../data/giving";

export type DonationRow = {
  id: string;
  paid_at: string | null;
  status: string;
  amount_cents: number | string;
  wants_18a: boolean;
  recurring_id: string | null;
  charities: { slug: string; name_en: string; thank_you_en?: string | null } | { slug: string; name_en: string; thank_you_en?: string | null }[] | null;
};
export type KindRow = { donation_id: string; kind: string };
export type RecurringRow = {
  id: string;
  amount_cents: number | string;
  status: string;
  needs_gateway_sync?: boolean;
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
const isKind = (k: string | undefined): k is GivingKind => k === "maaser" || k === "chomesh" || k === "tzedaka";

/**
 * Paid donations only: they are what counts towards maaser and chomesh.
 * (Refunded or charged-back donations drop out; pending ones aren't money yet.)
 * A donation from before giving kinds were recorded counts as general tzedaka.
 */
export function toGifts(donations: DonationRow[], kinds: KindRow[]): Gift[] {
  const kindOf = new Map(kinds.map((k) => [k.donation_id, k.kind]));
  return donations
    .filter((d) => d.status === "paid" && d.paid_at)
    .map((d) => {
      const c = one(d.charities);
      const k = kindOf.get(d.id);
      return {
        id: d.id,
        date: new Date(d.paid_at!),
        charitySlug: c?.slug ?? "",
        charityName: c?.name_en ?? "Charity",
        cents: Number(d.amount_cents),
        monthly: d.recurring_id !== null,
        with18a: d.wants_18a,
        kind: isKind(k) ? k : "tzedaka",
        ...(c?.thank_you_en ? { thankYou: c.thank_you_en } : {}),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function toRecurring(rows: RecurringRow[]): Recurring[] {
  return rows
    // Cancelled ones only show while the payment provider hasn't yet stopped them.
    .filter((r) => r.status === "active" || r.status === "paused" || (r.status === "cancelled" && r.needs_gateway_sync === true))
    .map((r) => {
      const c = one(r.charities);
      return {
        id: r.id,
        charitySlug: c?.slug ?? "",
        charityName: c?.name_en ?? "Charity",
        cents: Number(r.amount_cents),
        nextDate: r.next_charge_at ? new Date(r.next_charge_at) : null,
        status: r.status as "active" | "paused" | "cancelled",
        syncing: r.needs_gateway_sync === true,
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
      issued: new Date(r.issued_at),
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
  return gifts.filter((g) => g.date.getTime() > since && !ids.has(g.id)).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** What to remember as seen: the newest 200 donations, and the date of the oldest of them. */
export function seenFrom(gifts: Gift[]): Seen {
  const newest = [...gifts].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 200);
  return { ids: newest.map((g) => g.id), since: newest.length ? newest[newest.length - 1].date.toISOString() : null };
}

/**
 * The last giving the phone loaded, kept on the phone so the app opens straight
 * away and still shows history without signal. Dates go in as ISO strings and
 * every field is checked on the way back in; anything odd means no cache.
 */
export type Cached = { gifts: Gift[]; recurring: Recurring[]; receipts: Receipt[]; elsewhere: { id: string; date: Date; recipient: string; cents: number; kind: GivingKind }[]; loadedAt: Date };

export function toCache(live: Cached): string {
  // Kept small: the newest 500 donations, without the charities' thank-you notes.
  const gifts = [...live.gifts]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 500)
    .map(({ thankYou: _note, ...g }) => g);
  return JSON.stringify({ v: 1, ...live, gifts });
}

export function fromCache(raw: string | null): Cached | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== 1) return null;
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
    const kind = (v: unknown): GivingKind => {
      if (v !== "maaser" && v !== "chomesh" && v !== "tzedaka") throw new Error("bad kind");
      return v;
    };
    const list = (v: unknown): Record<string, unknown>[] => {
      if (!Array.isArray(v)) throw new Error("bad list");
      return v as Record<string, unknown>[];
    };
    return {
      gifts: list(o.gifts).map((g) => ({
        id: str(g.id),
        date: date(g.date),
        charitySlug: str(g.charitySlug),
        charityName: str(g.charityName),
        cents: cents(g.cents),
        monthly: g.monthly === true,
        with18a: g.with18a === true,
        kind: kind(g.kind),
        ...(typeof g.thankYou === "string" ? { thankYou: g.thankYou } : {}),
      })),
      recurring: list(o.recurring).map((r) => {
        const status = r.status === "active" || r.status === "paused" || r.status === "cancelled" ? r.status : null;
        if (!status) throw new Error("bad status");
        return {
          id: str(r.id),
          charitySlug: str(r.charitySlug),
          charityName: str(r.charityName),
          cents: cents(r.cents),
          nextDate: r.nextDate == null ? null : date(r.nextDate),
          status,
          ...(r.syncing === true ? { syncing: true } : {}),
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
      elsewhere: list(o.elsewhere).map((e) => ({ id: str(e.id), date: date(e.date), recipient: str(e.recipient), cents: cents(e.cents), kind: kind(e.kind) })),
      loadedAt: date(o.loadedAt),
    };
  } catch {
    return null;
  }
}
