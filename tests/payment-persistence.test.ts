/**
 * confirmPayment must never report a final result that was not saved.
 * The Supabase client and gateway are stand-ins so failures can be injected.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Donation = { id: string; status: string; gateway: string; total_charged_cents: number; gateway_ref: string };
let row: Donation;
const plan = { readError: false, updateError: false, updateRows: "apply" as "apply" | "none", rereadError: false };
let rereadCalls = 0;
const verify = vi.fn();
const notify = vi.fn(async (_id: string) => {});
const audit = vi.fn(async (_e: unknown) => {});

vi.mock("@/lib/audit", () => ({ logAudit: (e: unknown) => audit(e) }));
vi.mock("@/lib/donations/notify", () => ({ notifyDonationPaid: (id: string) => notify(id) }));
vi.mock("@/lib/gateway", () => ({ gatewayByName: () => ({ verifyTransaction: verify }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        const q = {
          eq: () => q,
          maybeSingle: async () => {
            if (cols === "status") {
              rereadCalls++;
              return plan.rereadError ? { data: null, error: { message: "down" } } : { data: { status: row.status }, error: null };
            }
            return plan.readError ? { data: null, error: { message: "down" } } : { data: { ...row }, error: null };
          },
        };
        return q;
      },
      update: (patch: Partial<Donation>) => {
        const allowed: string[] = [];
        const q = {
          eq: (_c: string, v: string) => (allowed.push(v), q),
          in: (_c: string, v: string[]) => (allowed.push(...v), q),
          select: async () => {
            if (plan.updateError) return { data: null, error: { message: "write refused" } };
            if (plan.updateRows === "none" || !allowed.includes(row.status)) return { data: [], error: null };
            Object.assign(row, patch);
            return { data: [{ id: row.id }], error: null };
          },
        };
        return q;
      },
    }),
  }),
}));

const { confirmPayment, PersistenceError } = await import("@/lib/donations/confirm");
const REF = "11111111-1111-1111-1111-111111111111";
const paidTx = { status: "success", amountCents: 20_000, currency: "ZAR", paidAt: "2026-10-11T10:00:00Z" };

beforeEach(() => {
  row = { id: REF, status: "pending", gateway: "test", total_charged_cents: 20_000, gateway_ref: REF };
  Object.assign(plan, { readError: false, updateError: false, updateRows: "apply", rereadError: false });
  rereadCalls = 0;
  verify.mockReset();
  verify.mockResolvedValue(paidTx);
  notify.mockClear();
  audit.mockClear();
});

describe("confirmPayment and database failures", () => {
  it("saves a paid donation and emails once", async () => {
    expect(await confirmPayment(REF)).toBe("paid");
    expect(row.status).toBe("paid");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not claim paid when the write is refused, then succeeds on retry", async () => {
    plan.updateError = true;
    await expect(confirmPayment(REF)).rejects.toBeInstanceOf(PersistenceError);
    expect(row.status).toBe("pending");
    expect(notify).not.toHaveBeenCalled();

    plan.updateError = false;
    expect(await confirmPayment(REF)).toBe("paid");
    expect(row.status).toBe("paid");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not claim failed when the failed write is refused, then saves it on retry", async () => {
    verify.mockResolvedValue({ status: "failed", amountCents: 0, currency: "ZAR" });
    plan.updateError = true;
    await expect(confirmPayment(REF)).rejects.toBeInstanceOf(PersistenceError);
    expect(row.status).toBe("pending");

    plan.updateError = false;
    expect(await confirmPayment(REF)).toBe("failed");
    expect(row.status).toBe("failed");
  });

  it("an empty update that left the donation pending is an error, not paid", async () => {
    plan.updateRows = "none";
    await expect(confirmPayment(REF)).rejects.toBeInstanceOf(PersistenceError);
    expect(notify).not.toHaveBeenCalled();
  });

  it("an empty update because a concurrent confirmation already saved paid is paid, with no second email", async () => {
    // The other confirmation lands between our read and our write.
    verify.mockImplementation(async () => {
      row.status = "paid";
      return paidTx;
    });
    expect(await confirmPayment(REF)).toBe("paid");
    expect(rereadCalls).toBeGreaterThan(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("a concurrent confirmation that already marked it failed leaves a paid result unchanged only if saved", async () => {
    // pending -> failed by someone else, then our paid write is allowed from failed.
    verify.mockImplementation(async () => {
      row.status = "failed";
      return paidTx;
    });
    expect(await confirmPayment(REF)).toBe("paid");
    expect(row.status).toBe("paid");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("running it again after paid does not email again", async () => {
    await confirmPayment(REF);
    await confirmPayment(REF);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("a failed read is an error, not 'not found'", async () => {
    plan.readError = true;
    await expect(confirmPayment(REF)).rejects.toBeInstanceOf(PersistenceError);
  });

  it("a failed re-read after an empty update is an error", async () => {
    plan.updateRows = "none";
    plan.rereadError = true;
    await expect(confirmPayment(REF)).rejects.toBeInstanceOf(PersistenceError);
  });

  it("still rejects a wrong amount or currency without saving anything", async () => {
    verify.mockResolvedValue({ ...paidTx, amountCents: 19_999 });
    expect(await confirmPayment(REF)).toBe("review");
    verify.mockResolvedValue({ ...paidTx, currency: "USD" });
    expect(await confirmPayment(REF)).toBe("review");
    expect(row.status).toBe("pending");
    expect(audit).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
  });

  it("stays pending while the gateway says pending", async () => {
    verify.mockResolvedValue({ status: "pending", amountCents: 0, currency: "ZAR" });
    expect(await confirmPayment(REF)).toBe("pending");
    expect(row.status).toBe("pending");
  });
});
