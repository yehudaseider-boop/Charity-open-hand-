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
  charities: { slug: string; name_en: string } | { slug: string; name_en: string }[] | null;
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
