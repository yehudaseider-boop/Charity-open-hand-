/**
 * Webhook: unfinished payments stay retryable and are never marked processed.
 * Supabase client and gateway are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type EventRow = { id: string; processed_at: string | null };
const events = new Map<string, EventRow>();
const audits: unknown[] = [];
let validSignature = true;
let eventType = "payment_succeeded";
let processedWriteFails = false;
const confirmPayment = vi.fn(async (_ref: string): Promise<string> => "paid");

vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: (ref: string) => confirmPayment(ref) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: unknown) => void audits.push(e) }));
vi.mock("@/lib/gateway", () => ({
  getGateway: () => ({ name: "test" }),
  gatewayByName: () => ({
    name: "test",
    parseWebhook: async (raw: string) => {
      if (!validSignature) return null;
      const body = JSON.parse(raw) as { id: string; reference: string };
      return { eventId: body.id, type: eventType, reference: body.reference, raw: body };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: (row: { event_id: string }) => ({
        select: async () => {
          if (events.has(row.event_id)) return { data: [], error: null };
          const stored = { id: `row-${row.event_id}`, processed_at: null };
          events.set(row.event_id, stored);
          return { data: [{ id: stored.id }], error: null };
        },
      }),
      select: () => {
        const filters: Record<string, string> = {};
        const q = {
          eq: (c: string, v: string) => ((filters[c] = v), q),
          single: async () => {
            const row = events.get(filters.event_id);
            return row ? { data: row, error: null } : { data: null, error: { message: "nope" } };
          },
        };
        return q;
      },
      update: (patch: { processed_at: string }) => ({
        eq: async (_c: string, id: string) => {
          if (processedWriteFails) return { error: { message: "write refused" } };
          for (const r of events.values()) if (r.id === id) r.processed_at = patch.processed_at;
          return { error: null };
        },
      }),
    }),
  }),
}));

async function deliver(id: string) {
  const { POST } = await import("@/app/api/webhooks/[gateway]/route");
  const request = new Request("http://localhost/api/webhooks/test", { method: "POST", body: JSON.stringify({ id, reference: "ref-1" }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any, { params: Promise.resolve({ gateway: "test" }) } as any);
}

beforeEach(() => {
  events.clear();
  audits.length = 0;
  validSignature = true;
  eventType = "payment_succeeded";
  processedWriteFails = false;
  confirmPayment.mockReset();
  confirmPayment.mockResolvedValue("paid");
});

describe("webhook retries", () => {
  it("a signed success event that is still pending is not marked processed, and confirms on the retry", async () => {
    confirmPayment.mockResolvedValueOnce("pending");
    const first = await deliver("evt-1");
    expect(first.status).toBe(503);
    expect(events.get("evt-1")?.processed_at).toBeNull();

    const retry = await deliver("evt-1");
    expect(retry.status).toBe(200);
    expect(confirmPayment).toHaveBeenCalledTimes(2);
    expect(events.get("evt-1")?.processed_at).not.toBeNull();
  });

  it("a failed payment event that is still pending at the gateway is retried too", async () => {
    eventType = "payment_failed";
    confirmPayment.mockResolvedValueOnce("pending");
    expect((await deliver("evt-2")).status).toBe(503);
    expect(events.get("evt-2")?.processed_at).toBeNull();
  });

  it("a temporary database or gateway error gives an error status and stays unprocessed", async () => {
    confirmPayment.mockRejectedValueOnce(new Error("db down"));
    expect((await deliver("evt-3")).status).toBe(500);
    expect(events.get("evt-3")?.processed_at).toBeNull();
    expect((await deliver("evt-3")).status).toBe(200);
  });

  it("does not acknowledge when marking the event processed fails", async () => {
    processedWriteFails = true;
    expect((await deliver("evt-4")).status).toBe(500);
    expect(events.get("evt-4")?.processed_at).toBeNull();
    processedWriteFails = false;
    expect((await deliver("evt-4")).status).toBe(200);
  });

  it("a finished event delivered again is acknowledged without confirming again", async () => {
    await deliver("evt-5");
    const again = await deliver("evt-5");
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("a payment held for review is finished here, with its audit entry made by the confirmation", async () => {
    confirmPayment.mockResolvedValueOnce("review");
    expect((await deliver("evt-6")).status).toBe(200);
    expect(events.get("evt-6")?.processed_at).not.toBeNull();
  });

  it("a payment we can't match is recorded for follow-up, not silently finished", async () => {
    confirmPayment.mockResolvedValueOnce("not_found");
    expect((await deliver("evt-7")).status).toBe(200);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "webhook.unmatched_payment" });
  });

  it("rejects an invalid signature without storing or confirming anything", async () => {
    validSignature = false;
    expect((await deliver("evt-8")).status).toBe(401);
    expect(events.size).toBe(0);
    expect(confirmPayment).not.toHaveBeenCalled();
  });
});
