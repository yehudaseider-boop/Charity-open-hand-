import "server-only";
import { donorName } from "@/lib/charity/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildDeposit, type Deposit, type GiftIn } from "./deposits";

/**
 * Reading a charity's deposits. Every call comes after loadCharityForManager(charityId): payouts are
 * server-only, so they are read with the service role and always filtered by the charity.
 */

export type DepositSummary = { id: string; paidOutOn: string; status: "paid" | "pending" | "failed"; amountCents: number; deposit: Deposit };

type PayoutRow = { id: string; paid_out_on: string; status: string; amount_cents: number | string };
type LineRow = { payout_id: string; kind: string; donation_id: string | null; gross_cents: number | string; fee_cents: number | string; net_cents: number | string; line_no: number };

/** The charity's deposits, newest first, each with its lines worked out. */
export async function listDeposits(charityId: string, limit = 60): Promise<DepositSummary[]> {
  const db = createAdminClient();
  // Read in pages: the database hands back at most 1 000 rows at a time, and "Download all" asks for more.
  const payouts: PayoutRow[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await db
      .from("payouts")
      .select("id, paid_out_on, status, amount_cents")
      .eq("charity_id", charityId)
      .order("paid_out_on", { ascending: false })
      .order("id")
      .range(from, Math.min(from + 999, limit - 1));
    if (error) throw error;
    payouts.push(...((data ?? []) as PayoutRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return withLines(charityId, payouts);
}

/** One deposit of this charity's, or null. */
export async function loadDeposit(charityId: string, payoutId: string): Promise<DepositSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(payoutId)) return null;
  const { data, error } = await createAdminClient()
    .from("payouts")
    .select("id, paid_out_on, status, amount_cents")
    .eq("charity_id", charityId)
    .eq("id", payoutId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await withLines(charityId, [data as PayoutRow]))[0] ?? null;
}

/**
 * Every line of these deposits. A busy charity's deposits can hold thousands of lines, so they are read a few
 * deposits at a time and in pages; a line left out would make a deposit look as if it doesn't add up.
 */
async function withLines(charityId: string, payouts: PayoutRow[]): Promise<DepositSummary[]> {
  if (!payouts.length) return [];
  const db = createAdminClient();
  const lines: LineRow[] = [];
  const ids = payouts.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("payout_lines")
        .select("payout_id, kind, donation_id, gross_cents, fee_cents, net_cents, line_no")
        .in("payout_id", chunk)
        .order("payout_id")
        .order("line_no")
        .range(from, from + 999);
      if (error) throw error;
      lines.push(...((data ?? []) as LineRow[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  const gifts = await giftsFor(charityId, [...new Set(lines.map((l) => l.donation_id).filter((x): x is string => Boolean(x)))]);
  const byPayout = new Map<string, LineRow[]>();
  for (const l of lines) {
    const list = byPayout.get(l.payout_id);
    if (list) list.push(l);
    else byPayout.set(l.payout_id, [l]);
  }
  return payouts.map((p) => ({
    id: p.id,
    paidOutOn: p.paid_out_on,
    status: p.status as DepositSummary["status"],
    amountCents: Number(p.amount_cents),
    deposit: buildDeposit(
      Number(p.amount_cents),
      (byPayout.get(p.id) ?? [])
        .sort((a, b) => a.line_no - b.line_no)
        .map((l) => ({ kind: l.kind as "payment", donationId: l.donation_id, grossCents: Number(l.gross_cents), feeCents: Number(l.fee_cents), netCents: Number(l.net_cents) })),
      gifts,
    ),
  }));
}

/** The charity's own gifts (from its view of them), with the donor's name as the dashboard shows it. */
async function giftsFor(charityId: string, ids: string[]): Promise<Map<string, GiftIn>> {
  const out = new Map<string, GiftIn>();
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("charity_donations")
      .select("id, amount_cents, paid_at, donor_type, first_name, last_name, organisation_name, email")
      .eq("charity_id", charityId)
      .in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const d of data ?? []) {
      out.set(d.id as string, { id: d.id as string, amountCents: Number(d.amount_cents), paidAt: d.paid_at as string | null, donorName: donorName(d as Parameters<typeof donorName>[0]) });
    }
  }
  return out;
}
