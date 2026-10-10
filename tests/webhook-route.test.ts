/**
 * Webhook route: repeat deliveries. Runs without a database (the Supabase
 * client, gateway and payment confirmation are stand-ins).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type EventRow = { id: string; processed_at: string | null };
const events = new Map<string, EventRow>();
const confirmPayment = vi.fn(async (_ref: string) => "paid");

vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: (ref: string) => confirmPayment(ref) }));
vi.mock("@/lib/gateway", () => ({
  gatewayByName: () => ({
    name: "test",
    parseWebhook: async (raw: string) => {
      const body = JSON.parse(raw) as { id: string; reference: string };
      return { eventId: body.id, type: "payment_succeeded", reference: body.reference, raw: body };
    },
  }),
}));

/** Just enough of the Supabase query builder for the route. */
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
          eq: (col: string, val: string) => ((filters[col] = val), q),
          single: async () => {
            const row = events.get(filters.event_id);
            return row ? { data: row, error: null } : { data: null, error: { message: "not found" } };
          },
        };
        return q;
      },
      update: (patch: { processed_at: string }) => ({
        eq: async (_col: string, id: string) => {
          for (const row of events.values()) if (row.id === id) row.processed_at = patch.processed_at;
          return { error: null };
        },
      }),
    }),
  }),
}));

async function deliver(id: string, reference = "ref-1") {
  const { POST } = await import("@/app/api/webhooks/[gateway]/route");
  const request = new Request("http://localhost/api/webhooks/test", {
    method: "POST",
    body: JSON.stringify({ id, reference }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(request as any, { params: Promise.resolve({ gateway: "test" }) } as any);
}

beforeEach(() => {
  events.clear();
  confirmPayment.mockReset();
  confirmPayment.mockResolvedValue("paid");
});

describe("payment webhook", () => {
  it("processes a new event once and ignores a finished repeat", async () => {
    expect((await deliver("evt-1")).status).toBe(200);
    expect(await (await deliver("evt-1")).json()).toEqual({ ok: true, duplicate: true });
    expect(confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("retries an event whose first delivery failed part-way", async () => {
    confirmPayment.mockRejectedValueOnce(new Error("gateway API down"));
    await expect(deliver("evt-2")).rejects.toThrow(/gateway API down/);
    expect(events.get("evt-2")?.processed_at).toBeNull();

    const retry = await deliver("evt-2");
    expect(await retry.json()).toEqual({ ok: true });
    expect(confirmPayment).toHaveBeenCalledTimes(2);
    expect(events.get("evt-2")?.processed_at).not.toBeNull();
  });
});
