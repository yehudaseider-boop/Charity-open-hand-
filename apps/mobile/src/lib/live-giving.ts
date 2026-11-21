/**
 * Turning the donor's own rows from the database into what the screens show.
 * Pure functions (no React Native), so the website's test suite can check them.
 */
import { cleanSignInCode } from "@shared/sign-in-code";
import { DECLINED_REASON } from "@shared/donations/monthly-reasons";
import type { Gift, Receipt, Recurring } from "../data/giving";
import { cleanLabel, labelOf } from "@shared/donations/labels";
import { thankYouNoteToShow } from "@shared/charity/thank-you-note";
import { monthlyCardChargeAt, type CardChargeRates } from "@shared/fees";
import { jhbDay, rand } from "./format";

/**
 * Did the server refuse a read because it doesn't have these columns yet (a migration not run there)? Postgres says
 * 42703 ("column donations.refunded_cents does not exist"); PostgREST's schema cache says PGRST204. Anything else (a
 * dropped connection, a time-out, a server error) is not this, and must show as a load error, never be hidden by a
 * read without the columns (which would show full amounts with no sign of a refund).
 */
export function isMissingColumn(e: unknown, columns: string[]): boolean {
  if (!e || typeof e !== "object") return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  if (code === "42703" || code === "PGRST204") return true;
  // Some versions answer without the code: only a message that names one of the columns as missing counts.
  const text = typeof message === "string" ? message : "";
  return /does not exist|could not find|schema cache/i.test(text) && columns.some((c) => text.includes(c));
}

export type DonationRow = {
  id: string;
  paid_at: string | null;
  status: string;
  amount_cents: number | string;
  /** Cents of the gift refunded in part refunds (the gift stays paid). Left out means none. */
  refunded_cents?: number | string | null;
  /** Why the gift is kept off s18A receipts for now ("dispute open", "refund being reviewed"); null when it isn't. */
  receipt_hold?: string | null;
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
  /** The donor chose to cover the card charge: each month also collects it, at that month's rates. */
  covers_card_charge?: boolean | null;
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
 * Each counts what is left after any part refund, as its s18A receipt does; a gift refunded in full in parts drops
 * out like a refunded one (code review 20/11/2026).
 * Each carries the donor's own label, if they gave one. Old fixed choices are ignored: only a label the donor
 * typed themselves shows (decided 02/11/2026).
 */
export function toGifts(donations: DonationRow[], kinds: KindRow[]): Gift[] {
  const labelFor = new Map(kinds.map((k) => [k.donation_id, labelOf(k)]));
  return donations
    .filter((d) => d.status === "paid" && d.paid_at && leftOf(d) > 0)
    .map((d) => {
      const c = one(d.charities);
      // Cleaned as the website shows it: no hidden characters, and never a note with a web address in it.
      const thankYou = thankYouNoteToShow(c?.thank_you_en);
      return {
        id: d.id,
        date: jhbDay(new Date(d.paid_at!)),
        at: new Date(d.paid_at!),
        charitySlug: c?.slug ?? "",
        charityName: c?.name_en ?? "Charity",
        cents: leftOf(d),
        monthly: d.recurring_id !== null,
        with18a: d.wants_18a,
        ...(d.receipt_hold ? { receiptHeld: true } : {}),
        label: labelFor.get(d.id) ?? null,
        ...(thankYou ? { thankYou } : {}),
      };
    })
    .sort((a, b) => momentOf(b) - momentOf(a));
}

/** What is left of a gift after part refunds (the website's rule, src/lib/donations/what-is-left.ts). Never below 0. */
const leftOf = (d: Pick<DonationRow, "amount_cents" | "refunded_cents">): number => Math.max(0, Number(d.amount_cents) - Number(d.refunded_cents ?? 0));

/** When a gift was paid, to the moment where known (live), else its day. */
const momentOf = (g: Gift) => (g.at ?? g.date).getTime();

/**
 * Whether a gift counts towards the donor's s18A receipts, as the website says it: asked for one, and not paid with
 * "Add my details after paying" while those details are still to come (such a gift can't go on a receipt yet).
 * A gift held off receipts while a person looks (a dispute, a refund being reviewed) doesn't count either, as the
 * receipt run leaves it off (20/11/2026). `detailsLater`: the gifts given on this phone that way (lib/pending-gift-store).
 */
export function countsTowardsReceipts(g: Pick<Gift, "id" | "with18a" | "receiptHeld">, detailsLater: ReadonlySet<string>): boolean {
  return g.with18a && !g.receiptHeld && !detailsLater.has(g.id);
}

/** The provider's rates from our server: known (null means nothing is added), or not known (we couldn't ask). */
export type RatesAnswer = { known: true; rates: CardChargeRates | null } | { known: false };

/**
 * The card charge a covered monthly donation collects each month, worked out with the website's own shared helper,
 * or null when it can't be known now (the rates couldn't be fetched). 0 when not covered.
 */
function cardChargeOf(amountCents: number, contributionCents: number, covers: boolean, rates: RatesAnswer): number | null {
  if (!covers) return 0;
  if (!rates.known) return null;
  try {
    return monthlyCardChargeAt(amountCents, contributionCents, true, rates.rates);
  } catch {
    return null;
  }
}

export function toRecurring(rows: RecurringRow[], rates: RatesAnswer = { known: false }): Recurring[] {
  return rows
    // Cancelled ones only show while the payment provider hasn't yet stopped them. A failed one stays so the donor sees why it stopped.
    .filter((r) => r.status === "active" || r.status === "paused" || r.status === "failed" || (r.status === "cancelled" && r.needs_gateway_sync === true))
    .map((r) => {
      const c = one(r.charities);
      const cents = Number(r.amount_cents);
      const contributionCents = Number(r.contribution_cents ?? 0);
      const cardCharge = cardChargeOf(cents, contributionCents, r.covers_card_charge === true, rates);
      return {
        id: r.id,
        charitySlug: c?.slug ?? "",
        charityName: c?.name_en ?? "Charity",
        cents,
        contributionCents,
        ...(cardCharge === null ? { cardChargeUnknown: true } : cardCharge > 0 ? { cardChargeCents: cardCharge } : {}),
        nextDate: r.next_charge_at ? jhbDay(new Date(r.next_charge_at)) : null,
        status: r.status as "active" | "paused" | "cancelled" | "failed",
        syncing: r.needs_gateway_sync === true,
        ...((r.status === "failed" && r.ended_reason === DECLINED_REASON) || (r.status === "active" && Number(r.failed_attempts ?? 0) > 0) ? { needsCard: true } : {}),
      };
    });
}

/**
 * What each month collects, as the website's account page says it: the gift, the contribution to Givezy and the
 * card charge the donor covers. "R112.30 a month", or "R110 a month plus the card charge" while the rates can't be fetched.
 */
export function monthlyAmountLine(r: Pick<Recurring, "cents" | "contributionCents" | "cardChargeCents" | "cardChargeUnknown">): string {
  const total = r.cents + (r.contributionCents ?? 0) + (r.cardChargeCents ?? 0);
  return `${rand(total)} a month${r.cardChargeUnknown ? " plus the card charge" : ""}`;
}

/** The parts of that monthly amount, when there is more than the gift: "R100 to the charity, R10 to Givezy and R2.30 card charge". */
export function monthlyAmountParts(r: Pick<Recurring, "cents" | "contributionCents" | "cardChargeCents" | "cardChargeUnknown">): string | null {
  const parts = [`${rand(r.cents)} to the charity`];
  if (r.contributionCents) parts.push(`${rand(r.contributionCents)} to Givezy`);
  if (r.cardChargeCents) parts.push(`${rand(r.cardChargeCents)} card charge`);
  else if (r.cardChargeUnknown) parts.push("the card charge at the payment provider's rates");
  if (parts.length === 1) return null;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
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

/** The code from the sign-in email, ignoring spaces and dashes: the website's own rule (src/lib/sign-in-code.ts). */
export const cleanCode = cleanSignInCode;

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
  // Version 2: dates are Johannesburg calendar days, with the exact moment kept as `at`. Version 3 (20/11/2026): a
  // gift's amount is what is left after part refunds, so a copy saved before then (the whole gift) is not used.
  return JSON.stringify({ v: 3, ...live, gifts });
}

export function fromCache(raw: string | null): Cached | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v !== 3) return null;
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
        ...(g.receiptHeld === true ? { receiptHeld: true } : {}),
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
          ...(r.cardChargeCents == null ? {} : { cardChargeCents: cents(r.cardChargeCents) }),
          ...(r.cardChargeUnknown === true ? { cardChargeUnknown: true } : {}),
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

/**
 * Where the donor's own giving stands, for Progress and Home alike (20/11/2026): still loading, failed with no
 * saved copy to show, or ready (fresh, or the copy saved last time). Home used to show "R0 of R12 000 · 0 gifts"
 * while giving loaded or after it failed; both screens now read it the same way. `status` is the account status.
 */
export function givingLoadState(a: { status: string; hasLive: boolean; loadError: boolean }): "loading" | "error" | "ready" {
  if (a.status === "loading") return "loading";
  if (a.loadError && !a.hasLive) return "error";
  if (a.status === "signed-in" && !a.hasLive) return "loading";
  return "ready";
}

/** What Progress says when giving can't be loaded and there is no saved copy; Home says the same. */
export const GIVING_LOAD_ERROR = "We couldn't load your giving. Check your connection and try again.";
