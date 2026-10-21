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

/** The charity's deposits, newest first, each with its lines worked out. */
export async function listDeposits(charityId: string, limit = 60): Promise<DepositSummary[]> {
  const db = createAdminClient();
  const { data: payouts, error } = await db
    .from("payouts")
    .select("id, paid_out_on, status, amount_cents")
    .eq("charity_id", charityId)
    .order("paid_out_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!payouts?.length) return [];
  const { data: lines, error: lineError } = await db
    .from("payout_lines")
    .select("payout_id, kind, donation_id, gross_cents, fee_cents, net_cents, line_no")
    .in("payout_id", payouts.map((p) => p.id))
    .order("line_no");
  if (lineError) throw lineError;
  const gifts = await giftsFor(charityId, [...new Set((lines ?? []).map((l) => l.donation_id as string | null).filter((x): x is string => Boolean(x)))]);
  return payouts.map((p) => ({
    id: p.id as string,
    paidOutOn: p.paid_out_on as string,
    status: p.status as DepositSummary["status"],
    amountCents: Number(p.amount_cents),
    deposit: buildDeposit(
      Number(p.amount_cents),
      (lines ?? [])
        .filter((l) => l.payout_id === p.id)
        .map((l) => ({ kind: l.kind as "payment", donationId: l.donation_id as string | null, grossCents: Number(l.gross_cents), feeCents: Number(l.fee_cents), netCents: Number(l.net_cents) })),
      gifts,
    ),
  }));
}

/** One deposit of this charity's, or null. */
export async function loadDeposit(charityId: string, payoutId: string): Promise<DepositSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(payoutId)) return null;
  const all = await listDeposits(charityId, 1000);
  return all.find((d) => d.id === payoutId) ?? null;
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
