/**
 * Active monthly donations on a payment provider that is no longer the active one are listed for Admin (once a day each)
 * instead of silently never being collected (23/11/2026). Database stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const audits: { action: string; entityId: string | null; details?: Record<string, unknown> }[] = [];
vi.mock("@/lib/audit", () => ({ logAudit: async (e: { action: string; entityId: string | null; details?: Record<string, unknown> }) => void audits.push(e) }));
vi.mock("@/lib/donations/confirm", () => ({ confirmPayment: async () => "paid" }));
vi.mock("@/lib/donations/charity", () => ({ loadDonatableCharity: async () => null }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({}) }));
vi.mock("@/lib/gateway", () => ({ getGateway: () => ({ name: "test" }) }));

let otherGatewayRows: { id: string; gateway: string }[] = [];
let notedToday: { entity_id: string }[] = [];
const filters: Record<string, unknown[]> = {};
const fakeDb = {
  from: (table: string) => {
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => ((filters[`${table}.${c}`] = [v]), q),
      neq: (c: string, v: unknown) => ((filters[`${table}.${c}!`] = [v]), q),
      in: (c: string, v: unknown[]) => ((filters[`${table}.${c}`] = v), q),
      lte: () => q,
      gte: () => q,
      limit: async () => ({ data: otherGatewayRows, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: notedToday, error: null }).then(ok),
    };
    return q;
  },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb }));

const { holdOtherGateway } = await import("@/lib/donations/monthly-store");
const { heldLabel } = await import("@/lib/ops/held");

beforeEach(() => {
  audits.length = 0;
  otherGatewayRows = [];
  notedToday = [];
});

describe("monthly donations on a former payment provider", () => {
  it("are noted for a person, not silently left", async () => {
    otherGatewayRows = [{ id: "m1", gateway: "paystack" }, { id: "m2", gateway: "paystack" }];
    await holdOtherGateway(fakeDb as never, "stitch", new Date("2026-11-23T06:00:00Z"));
    expect(audits.map((a) => a.entityId)).toEqual(["m1", "m2"]);
    expect(audits[0]).toMatchObject({ action: "monthly.other_gateway", details: { gateway: "paystack", active: "stitch" } });
    expect(heldLabel["monthly.other_gateway"]).toMatch(/no longer use/);
  });

  it("are noted once a day each, however many times the collection runs", async () => {
    otherGatewayRows = [{ id: "m1", gateway: "paystack" }, { id: "m2", gateway: "paystack" }];
    notedToday = [{ entity_id: "m1" }];
    await holdOtherGateway(fakeDb as never, "stitch", new Date("2026-11-23T06:00:00Z"));
    expect(audits.map((a) => a.entityId)).toEqual(["m2"]);
  });

  it("does nothing when every active monthly donation is on the active provider", async () => {
    await holdOtherGateway(fakeDb as never, "stitch", new Date("2026-11-23T06:00:00Z"));
    expect(audits).toEqual([]);
  });
});
