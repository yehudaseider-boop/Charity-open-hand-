import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { monthlyHealth, staleEvents, stalePending, totalsByCharity, MONTHLY_OVERDUE_HOURS, type PaidRow } from "@/lib/admin/payments-overview";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatRand } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { RemoveButton } from "@/components/forms/remove-button";
import { markDonation } from "./actions";

/** What each held item is, in plain words. */
const heldLabel: Record<string, string> = {
  "donation.amount_mismatch": "Amount did not match",
  "webhook.unmatched_payment": "Payment with no matching donation",
  "donation.refund_review": "Refund to check (partial, or the amount was not given)",
  "refund.unmatched": "Refund for a payment we could not find",
  "donation.dispute_opened": "Dispute (chargeback) opened",
  "donation.dispute_resolved": "Dispute resolved: check who won",
  "receipt.needs_reissue": "An issued s18A receipt includes a refunded or charged-back donation: void and re-issue it",
};
const HELD = Object.keys(heldLabel);

export const metadata: Metadata = { title: "Payments" };

/** The charity name from an embedded row, which the database client types as one row or a list. */
const nameOf = (v: unknown): string => {
  const row = (Array.isArray(v) ? v[0] : v) as { name_en?: string } | null | undefined;
  return row?.name_en ?? "Charity";
};

/** The database answers at most 1 000 rows at a time, so a long list is read page by page (up to 50 000). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const data: T[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const r = await page(from, from + 999);
    if (r.error) return { data: null, error: r.error, capped: false };
    data.push(...(r.data ?? []));
    if (!r.data || r.data.length < 1000) return { data, error: null, capped: false };
  }
  return { data, error: null, capped: true };
}

/** Payment health for the platform team: what is stuck, what needs a person, and what came in. */
export default async function PaymentsPage() {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString();

  const [pending, events, review, paid, monthly] = await Promise.all([
    db.from("donations").select("id, created_at, total_charged_cents, charities(name_en)").eq("status", "pending").order("created_at").limit(500),
    db.from("gateway_events").select("id, gateway, event_type, received_at, payload").is("processed_at", null).order("received_at").limit(200),
    db.from("audit_log").select("id, action, created_at, entity_type, entity_id, details").in("action", HELD).gte("created_at", since).order("created_at", { ascending: false }).limit(50),
    allRows((a, b) => db.from("donations").select("charity_id, amount_cents, contribution_cents, charities(name_en)").eq("status", "paid").gte("paid_at", since).order("id").range(a, b)),
    allRows((a, b) => db.from("recurring_donations").select("id, status, next_charge_at, last_attempt_at, amount_cents, contribution_cents, charities(name_en)").in("status", ["active", "paused", "failed"]).order("id").range(a, b)),
  ]);
  for (const r of [pending, events, review, paid, monthly]) if (r.error) throw r.error;
  // The current state of each donation a held item is about, so a handled one says so.
  const heldDonationIds = (review.data ?? []).filter((a) => a.entity_type === "donation" && a.entity_id).map((a) => a.entity_id as string);
  const statusById = new Map<string, string>();
  if (heldDonationIds.length) {
    const { data: rows, error: statusError } = await db.from("donations").select("id, status").in("id", heldDonationIds);
    if (statusError) throw statusError;
    for (const r of rows ?? []) statusById.set(r.id as string, r.status as string);
  }

  const stuckPayments = stalePending(
    (pending.data ?? []).map((r) => ({ id: r.id as string, created_at: r.created_at as string, total_charged_cents: r.total_charged_cents as number, charity: nameOf(r.charities) })),
    now,
  );
  const stuckEvents = staleEvents(
    (events.data ?? []).map((e) => {
      const p = (e.payload ?? {}) as { reference?: string; data?: { reference?: string } };
      return { id: e.id as string, gateway: e.gateway as string, event_type: e.event_type as string, received_at: e.received_at as string, reference: p.data?.reference ?? p.reference ?? null };
    }),
    now,
  );
  const totals = totalsByCharity(
    (paid.data ?? []).map((r): PaidRow => ({ charity_id: r.charity_id as string, charity: nameOf(r.charities), amount_cents: r.amount_cents as number, contribution_cents: r.contribution_cents as number })),
  );
  const health = monthlyHealth(
    (monthly.data ?? []).map((r) => ({
      id: r.id as string, status: r.status as string, next_charge_at: r.next_charge_at as string | null, last_attempt_at: r.last_attempt_at as string | null,
      charity: nameOf(r.charities), amount_cents: r.amount_cents as number, contribution_cents: r.contribution_cents as number,
    })),
    now,
  );
  const needsAttention = stuckPayments.length + stuckEvents.length + (review.data?.length ?? 0) + health.failed.length + health.overdue;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Payments</h1>
      <p className={`rounded-control p-3 text-sm ${needsAttention ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`} role="status">
        {needsAttention ? `${needsAttention} ${needsAttention === 1 ? "thing needs" : "things need"} a look below.` : "Nothing is stuck. All payments are settled."}
      </p>

      <Section title="Payments still pending" empty="None older than 30 minutes." count={stuckPayments.length}>
        <p className="mb-2 text-xs text-muted">The donor paid (or left) and we have not heard a result. Check the payment in the gateway&apos;s dashboard using the reference.</p>
        {stuckPayments.map((p) => (
          <Row key={p.reference} left={`${p.reference} · ${p.charity}`} right={`${formatRand(p.totalCents)} · ${ageText(p.minutes)}`} />
        ))}
      </Section>

      <Section title="Gateway messages not finished" empty="None." count={stuckEvents.length}>
        <p className="mb-2 text-xs text-muted">The gateway told us about a payment and we could not finish handling it. It is tried again whenever the gateway re-sends it.</p>
        {stuckEvents.map((e) => (
          <Row key={e.id} left={`${e.gateway} · ${e.type}${e.reference ? ` · ${e.reference}` : ""}`} right={formatDateTime(e.receivedAt)} />
        ))}
      </Section>

      <Section title="Held for a person (last 30 days)" empty="None." count={review.data?.length ?? 0}>
        <p className="mb-2 text-xs text-muted">
          Payments, refunds and disputes the system would not decide on its own. Check each in the gateway&apos;s dashboard. A full refund is marked
          automatically; for anything else, mark the donation here once you have checked it. Refunded and charged-back donations stop counting
          in the charity&apos;s totals, campaigns and s18A receipts.
        </p>
        {(review.data ?? []).map((a) => {
          const donationId = a.entity_type === "donation" ? (a.entity_id as string | null) : null;
          const status = donationId ? statusById.get(donationId) : undefined;
          // Without a matching donation, the gateway's reference is what to look up in its dashboard.
          const reference = (a.details as { reference?: string | null } | null)?.reference ?? null;
          return (
            <div key={a.id as string} className="border-t border-border py-1.5 first:border-t-0">
              <Row left={heldLabel[a.action as string] ?? (a.action as string)} right={formatDate(a.created_at as string)} />
              {donationId && status === "paid" ? (
                <div className="flex flex-wrap gap-3 pt-1 text-xs">
                  <span className="text-muted">Donation {donationId.slice(0, 8)}</span>
                  <form action={markDonation.bind(null, donationId, "refunded")}>
                    <RemoveButton label="Mark refunded" what={`donation ${donationId.slice(0, 8)}`} confirmText="Mark this donation refunded? It stops counting for the charity and on s18A receipts. Only do this once the gateway shows the refund." />
                  </form>
                  <form action={markDonation.bind(null, donationId, "charged_back")}>
                    <RemoveButton label="Mark charged back" what={`donation ${donationId.slice(0, 8)}`} confirmText="Mark this donation charged back? It stops counting for the charity and on s18A receipts. Only do this once the gateway shows the dispute was lost." />
                  </form>
                </div>
              ) : donationId && status ? (
                <p className="pt-1 text-xs text-muted">Donation {donationId.slice(0, 8)} is now {status.replace("_", " ")}.</p>
              ) : !donationId && reference ? (
                <p className="pt-1 text-xs text-muted">Gateway reference: <span className="font-mono">{reference}</span></p>
              ) : null}
            </div>
          );
        })}
      </Section>

      <Section title="Monthly donations" empty="" count={health.failed.length + health.overdue}>
        <p className="text-sm">
          {health.active} active · {health.paused} paused · {health.failed.length} stopped after failed attempts
        </p>
        <p className="mt-1 text-xs text-muted">
          {health.lastAttemptAt ? `Last collection attempt: ${formatDateTime(health.lastAttemptAt)}.` : "No collection has been attempted yet."}
        </p>
        {health.overdue > 0 ? (
          <p role="status" className="mt-2 rounded-control bg-warning-soft p-2 text-sm text-warning">
            {health.overdue} monthly {health.overdue === 1 ? "donation is" : "donations are"} more than {MONTHLY_OVERDUE_HOURS} hours late. The monthly job may not be running.
          </p>
        ) : null}
        {health.failed.map((f) => (
          <Row key={f.id} left={`Stopped: ${f.charity}`} right={`${formatRand(f.monthlyCents)} a month`} />
        ))}
      </Section>

      <section className="space-y-2 rounded-card border border-border bg-surface p-4 text-sm">
        <h2 className="font-semibold">Last 30 days, by charity</h2>
        <p className="text-xs text-muted">From our own records of confirmed payments. Compare with the gateway&apos;s settlement report. The donation goes to the charity; the contribution is Givezy&apos;s.</p>
        {totals.list.length === 0 ? <p className="text-muted">No confirmed payments in the last 30 days.</p> : null}
        {totals.list.map((t) => (
          <Row key={t.charity} left={`${t.charity} · ${t.count} ${t.count === 1 ? "payment" : "payments"}`} right={`${formatRand(t.donationCents)}${t.contributionCents ? ` + ${formatRand(t.contributionCents)}` : ""}`} />
        ))}
        {totals.list.length > 0 ? (
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
            <span>All charities · {totals.count}</span>
            <span>{formatRand(totals.donationCents)}{totals.contributionCents ? ` + ${formatRand(totals.contributionCents)}` : ""}</span>
          </div>
        ) : null}
        {paid.capped ? <p className="text-xs text-warning">Showing the first 50 000 payments only.</p> : null}
      </section>
    </div>
  );
}

function ageText(min: number) {
  return min < 120 ? `${min} min` : min < 2880 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} days`;
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1 rounded-card border border-border bg-surface p-4 text-sm">
      <h2 className="font-semibold">{title}</h2>
      {count === 0 && empty ? <p className="text-muted">{empty}</p> : children}
    </section>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border py-1.5 first:border-t-0">
      <span className="min-w-0 break-words">{left}</span>
      <span className="shrink-0 text-right text-muted">{right}</span>
    </div>
  );
}
