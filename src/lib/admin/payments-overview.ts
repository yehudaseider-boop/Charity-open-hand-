/**
 * What the Payments page shows, worked out from rows read from the database. Pure.
 */
import { donationReference } from "@/lib/donations/reference";

export type PendingRow = { id: string; created_at: string; total_charged_cents: number | string; charity: string };
export type EventRow = { id: string; gateway: string; event_type: string; received_at: string; reference: string | null };
export type PaidRow = { charity_id: string; charity: string; amount_cents: number | string; contribution_cents: number | string };
export type MonthlyRow = { id: string; status: string; next_charge_at: string | null; last_attempt_at: string | null; charity: string; amount_cents: number | string; contribution_cents: number | string };

const MINUTE = 60_000;

/** Payments still pending after this long need a look (the donor either left or the confirmation is stuck). */
export const PENDING_STALE_MIN = 30;
/** A payment event not finished after this long is not just in progress. */
export const EVENT_STALE_MIN = 5;
/** A monthly donation still due this long after its time means the monthly job is not running. */
export const MONTHLY_OVERDUE_HOURS = 24;

export function stalePending(rows: PendingRow[], now: Date) {
  return rows
    .filter((r) => now.getTime() - new Date(r.created_at).getTime() >= PENDING_STALE_MIN * MINUTE)
    .map((r) => ({ reference: donationReference(r.id), charity: r.charity, totalCents: Number(r.total_charged_cents), minutes: Math.floor((now.getTime() - new Date(r.created_at).getTime()) / MINUTE) }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function staleEvents(rows: EventRow[], now: Date) {
  return rows
    .filter((r) => now.getTime() - new Date(r.received_at).getTime() >= EVENT_STALE_MIN * MINUTE)
    .map((r) => ({ id: r.id, gateway: r.gateway, type: r.event_type, receivedAt: r.received_at, reference: r.reference ? donationReference(r.reference) : null }))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

/** Money per charity: what went to the charity and what Nadiv Lev received as contributions. */
export function totalsByCharity(rows: PaidRow[]) {
  const by = new Map<string, { charity: string; count: number; donationCents: number; contributionCents: number }>();
  for (const r of rows) {
    const t = by.get(r.charity_id) ?? { charity: r.charity, count: 0, donationCents: 0, contributionCents: 0 };
    t.count += 1;
    t.donationCents += Number(r.amount_cents);
    t.contributionCents += Number(r.contribution_cents);
    by.set(r.charity_id, t);
  }
  const list = [...by.values()].sort((a, b) => b.donationCents - a.donationCents);
  return {
    list,
    count: list.reduce((n, t) => n + t.count, 0),
    donationCents: list.reduce((n, t) => n + t.donationCents, 0),
    contributionCents: list.reduce((n, t) => n + t.contributionCents, 0),
  };
}

export function monthlyHealth(rows: MonthlyRow[], now: Date) {
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const overdue = rows.filter((r) => r.status === "active" && r.next_charge_at && now.getTime() - new Date(r.next_charge_at).getTime() >= MONTHLY_OVERDUE_HOURS * 60 * MINUTE);
  const lastRun = rows.map((r) => r.last_attempt_at).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  return {
    active: count("active"),
    paused: count("paused"),
    failed: rows.filter((r) => r.status === "failed").map((r) => ({ id: r.id, charity: r.charity, monthlyCents: Number(r.amount_cents) + Number(r.contribution_cents) })),
    overdue: overdue.length,
    // The job is "running" if something was attempted recently or nothing is due.
    lastAttemptAt: lastRun,
  };
}
