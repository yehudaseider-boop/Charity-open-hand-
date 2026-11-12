import "server-only";
import { getGateway } from "@/lib/gateway";
import type { Payout } from "@/lib/gateway/types";
import { isoDateInJhb } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads each connected charity's payouts from the payment provider and keeps them, with their lines, so the
 * charity's Deposits page can show them. A scheduler calls this once a day (see /api/jobs/payouts). Safe to
 * run again: a payout is kept once (by the provider's id) and its lines are replaced by the latest reading.
 */

/** How far back each run looks: payouts can change status for a few days after they are made. */
const LOOK_BACK_DAYS = 45;

export type PayoutSyncSummary = {
  charities: number;
  payouts: number;
  lines: number;
  unmatched: number;
  failed: { charityId: string; message: string }[];
  /** The time budget ran out: charities not reached (or not finished) are read on the next run. */
  outOfTime?: boolean;
  /** Charities not reached because the time ran out. */
  notReached?: number;
};

/**
 * `deadline` (epoch ms): no charity, and no payout within one, is started after it. Payouts already kept as final
 * (paid out or failed) aren't read again, so each day's run gets further. The order of charities moves on by one
 * each day, so the same charities are never always the ones left for tomorrow.
 */
export async function syncPayouts(now = new Date(), opts: { deadline?: number } = {}): Promise<PayoutSyncSummary> {
  const gateway = getGateway();
  const db = createAdminClient();
  const since = isoDateInJhb(new Date(now.getTime() - LOOK_BACK_DAYS * 86_400_000));
  const { data: charities, error } = await db
    .from("charities")
    .select("id, gateway, gateway_subaccount_ref")
    .eq("gateway", gateway.name)
    .not("gateway_subaccount_ref", "is", null)
    .order("id");
  if (error) throw error;
  const summary: PayoutSyncSummary = { charities: 0, payouts: 0, lines: 0, unmatched: 0, failed: [] };
  const list = charities ?? [];
  const shift = list.length ? Math.floor(now.getTime() / 86_400_000) % list.length : 0;
  const ordered = [...list.slice(shift), ...list.slice(0, shift)];
  const outOfTime = () => opts.deadline !== undefined && Date.now() > opts.deadline;
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    if (outOfTime()) {
      summary.outOfTime = true;
      summary.notReached = ordered.length - i;
      break;
    }
    try {
      const final = await finalPayoutRefs(c.id as string, gateway.name);
      const payouts = await gateway.listPayouts({ charityId: c.id as string, charityAccountRef: c.gateway_subaccount_ref as string, since, skipRefs: final, deadline: opts.deadline });
      // Out of time part-way: what was read in full is kept below, the rest is read tomorrow.
      if (outOfTime()) summary.outOfTime = true;
      for (const p of payouts) {
        const r = await keepPayout(c.id as string, gateway.name, p);
        summary.payouts += 1;
        summary.lines += r.lines;
        summary.unmatched += r.unmatched;
      }
      summary.charities += 1;
    } catch (e) {
      // One charity's trouble never stops the others; it is tried again on the next run.
      summary.failed.push({ charityId: c.id as string, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return summary;
}

/** This charity's payouts already kept as paid out or failed: their lines don't change, so they aren't read again. */
async function finalPayoutRefs(charityId: string, gatewayName: string): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("payouts")
    .select("gateway_payout_ref")
    .eq("charity_id", charityId)
    .eq("gateway", gatewayName)
    .in("status", ["paid", "failed"])
    .limit(5000);
  if (error) throw error;
  return new Set((data ?? []).map((p) => String(p.gateway_payout_ref)));
}

/** Keep one payout and replace its lines. Lines are matched to this charity's own gifts by reference only. */
export async function keepPayout(charityId: string, gatewayName: string, p: Payout): Promise<{ lines: number; unmatched: number }> {
  const db = createAdminClient();
  // A payout reference already kept for another charity is never moved across (checked before writing).
  const { data: existing, error: lookError } = await db.from("payouts").select("charity_id").eq("gateway", gatewayName).eq("gateway_payout_ref", p.ref).maybeSingle();
  if (lookError) throw lookError;
  if (existing && existing.charity_id !== charityId) throw new Error(`Payout ${p.ref} belongs to another charity.`);
  const { data: saved, error } = await db
    .from("payouts")
    .upsert(
      { charity_id: charityId, gateway: gatewayName, gateway_payout_ref: p.ref, paid_out_on: p.paidOutOn, amount_cents: p.amountCents, status: p.status, updated_at: new Date().toISOString() },
      { onConflict: "gateway,gateway_payout_ref" },
    )
    .select("id, charity_id")
    .single();
  if (error) throw error;

  const refs = [...new Set(p.lines.map((l) => l.reference).filter((r): r is string => Boolean(r)))];
  const ours = new Map<string, string>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data, error: findError } = await db
      .from("donations")
      .select("id, gateway_ref")
      .eq("charity_id", charityId)
      .eq("gateway", gatewayName)
      .in("gateway_ref", refs.slice(i, i + 200));
    if (findError) throw findError;
    for (const d of data ?? []) ours.set(d.gateway_ref as string, d.id as string);
  }
  const rows = p.lines.map((l, i) => ({
    payout_id: saved.id,
    donation_id: l.reference ? (ours.get(l.reference) ?? null) : null,
    gateway_reference: l.reference,
    kind: l.kind,
    gross_cents: l.grossCents,
    fee_cents: l.feeCents,
    net_cents: l.netCents,
    line_no: i + 1,
  }));
  const del = await db.from("payout_lines").delete().eq("payout_id", saved.id);
  if (del.error) throw del.error;
  if (rows.length) {
    const ins = await db.from("payout_lines").insert(rows);
    if (ins.error) throw ins.error;
  }
  return { lines: rows.length, unmatched: rows.filter((r) => !r.donation_id).length };
}
