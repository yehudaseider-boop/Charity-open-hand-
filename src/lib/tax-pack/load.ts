import "server-only";
import { labelOf } from "@/lib/donations/labels";
import { taxYearRange } from "@/lib/dates";
import { dedicationFrom, dedicationLine } from "@/lib/donations/dedication";
import { createClient } from "@/lib/supabase/server";
import { buildTaxPack, type PackDonationRow, type PackReceiptRow, type TaxPack } from "./build";

type DonationRow = {
  id: string;
  paid_at: string | null;
  amount_cents: number | string;
  wants_18a: boolean;
  recurring_id: string | null;
  dedication_kind: string | null;
  dedication_name: string | null;
  charities: { name_en: string } | { name_en: string }[] | null;
  donation_giving_kinds: { kind: string | null; label: string | null } | { kind: string | null; label: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * The signed-in person's tax pack for one tax year, read with their own session: row-level
 * security means they only ever see their own donations and receipts. Null if they have no donor record.
 */
export async function loadTaxPack(userId: string, taxYear: number): Promise<TaxPack | null> {
  const supabase = await createClient();
  const { data: donors } = await supabase.from("donors").select("id").eq("user_id", userId);
  const donorIds = (donors ?? []).map((d) => d.id as string);
  if (donorIds.length === 0) return null;

  // A day either side of the tax year in UTC; buildTaxPack then keeps exactly the year by Johannesburg time.
  const { start, end } = taxYearRange(taxYear);
  const from = new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString();
  const to = new Date(Date.parse(`${end}T00:00:00Z`) + 2 * 86_400_000).toISOString();

  const rows: DonationRow[] = [];
  for (let page = 0; ; page += 1000) {
    const { data, error } = await supabase
      .from("donations")
      .select("id, paid_at, amount_cents, wants_18a, recurring_id, dedication_kind, dedication_name, charities(name_en), donation_giving_kinds(kind, label)")
      .in("donor_id", donorIds)
      .eq("status", "paid")
      .gte("paid_at", from)
      .lt("paid_at", to)
      .order("paid_at")
      .order("id")
      .range(page, page + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as DonationRow[]));
    if (!data || data.length < 1000) break;
  }

  const { data: receipts, error: receiptsError } = await supabase
    .from("s18a_receipts")
    .select("id, amount_cents, issued_at, status, reference:details->>receipt_reference, charity_name:details->charity->>legal_name_en")
    .in("donor_id", donorIds)
    .eq("tax_year", taxYear);
  if (receiptsError) throw receiptsError;
  // Which donations are on an issued receipt (the donor can read their own receipts' links).
  const issuedIds = ((receipts ?? []) as { id: string; status: string }[]).filter((r) => r.status === "issued").map((r) => r.id);
  const receiptedIds = new Set<string>();
  if (issuedIds.length) {
    const { data: links, error: linksError } = await supabase.from("s18a_receipt_donations").select("donation_id").in("receipt_id", issuedIds);
    if (linksError) throw linksError;
    for (const l of links ?? []) receiptedIds.add(l.donation_id as string);
  }

  const donations: PackDonationRow[] = rows
    .filter((r) => r.paid_at)
    .map((r) => ({
      id: r.id,
      paidAt: r.paid_at!,
      charityName: one(r.charities)?.name_en ?? "Charity",
      amountCents: r.amount_cents,
      wants18a: r.wants_18a,
      monthly: r.recurring_id !== null,
      label: labelOf(one(r.donation_giving_kinds)),
      dedication: (() => {
        const d = dedicationFrom(r.dedication_kind, r.dedication_name);
        return d ? dedicationLine(d) : null;
      })(),
    }));
  const receiptRows: PackReceiptRow[] = ((receipts ?? []) as unknown as { amount_cents: number | string; issued_at: string; status: string; reference: string | null; charity_name: string | null }[]).map((r) => ({
    charityName: r.charity_name,
    reference: r.reference,
    amountCents: r.amount_cents,
    issuedAt: r.issued_at,
    status: r.status,
  }));
  return buildTaxPack(taxYear, donations, receiptRows, receiptedIds);
}
