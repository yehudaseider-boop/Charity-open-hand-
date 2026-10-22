import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReceiptDetails } from "./details";
import type { YearListReceipt } from "./year-list";

/** One charity's issued receipts for a tax year (withdrawn ones are left out). Service role: check access first. */
export async function loadYearReceipts(charityId: string, taxYear: number): Promise<YearListReceipt[]> {
  const db = createAdminClient();
  const out: YearListReceipt[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("s18a_receipts")
      .select("id, issued_at, amount_cents, details")
      .eq("charity_id", charityId)
      .eq("tax_year", taxYear)
      .eq("status", "issued")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const details = r.details as ReceiptDetails & { receipt_reference?: string };
      out.push({ reference: details.receipt_reference ?? null, issued_at: r.issued_at as string, amount_cents: Number(r.amount_cents), details });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Charities and tax years with issued receipts, newest first, for Givezy's admin. */
export async function yearsWithReceipts(): Promise<{ charityId: string; charityName: string; taxYear: number; count: number }[]> {
  const db = createAdminClient();
  const seen = new Map<string, { charityId: string; charityName: string; taxYear: number; count: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("s18a_receipts")
      .select("charity_id, tax_year, charities(name_en)")
      .eq("status", "issued")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const key = `${r.charity_id}:${r.tax_year}`;
      const c = r.charities as unknown as { name_en: string } | null;
      const row = seen.get(key) ?? { charityId: r.charity_id as string, charityName: c?.name_en ?? "A charity", taxYear: r.tax_year as number, count: 0 };
      row.count++;
      seen.set(key, row);
    }
    if (!data || data.length < 1000) break;
  }
  return [...seen.values()].sort((a, b) => b.taxYear - a.taxYear || a.charityName.localeCompare(b.charityName));
}
