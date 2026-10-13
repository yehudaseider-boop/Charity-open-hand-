/**
 * Starting a monthly donation when its first payment is confirmed. The database and gateway are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

type Recurring = { id: string; status: string; charge_day: number; first_donation_id: string; [k: string]: unknown };
type Donation = { id: string; status: string; gateway: string; total_charged_cents: number; recurring_id: string | null; gateway_ref: string };
let recurring: Recurring;
let donation: Donation;
let failNextRecurringWrite = false;
const verify = vi.fn();
const notify = vi.fn(async (_id: string, _o?: unknown) => {});
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/donations/notify", () => ({ notifyDonationPaid: (id: string, o?: unknown) => notify(id, o) }));
vi.mock("@/lib/gateway", () => ({ gatewayByName: () => ({ verifyTransaction: verify }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        in: (c: string, v: unknown[]) => ((filters[c] = v), q),
        maybeSingle: async () => {
          if (table === "donations") return { data: filters.gateway_ref === donation.gateway_ref || filters.id === donation.id ? { ...donation } : null, error: null };
          if (table === "recurring_donations") {
            const hit = recurring.first_donation_id === filters.first_donation_id && recurring.status === filters.status;
            return { data: hit ? { ...recurring } : null, error: null };
          }
          return { data: null, error: null };
        },
        update: (patch: Record<string, unknown>) => {
          const u = {
            eq: (c: string, v: unknown) => ((filters[c] = v), u),
            in: (c: string, v: unknown[]) => ((filters[c] = v), u),
            select: async () => {
              if (table === "donations") {
                const ok = (filters.status as unknown) === donation.status || (Array.isArray(filters.status) && (filters.status as string[]).includes(donation.status));
                if (!ok) return { data: [], error: null };
                Object.assign(donation, patch);
                return { data: [{ id: donation.id }], error: null };
              }
              return { data: [], error: null };
            },
            then: (resolve: (v: { error: unknown }) => void) => {
              if (table === "recurring_donations") {
                if (failNextRecurringWrite) return resolve({ error: { message: "write refused" } });
                if (recurring.status === filters.status) Object.assign(recurring, patch);
              }
              resolve({ error: null });
            },
          };
          return u;
        },
      };
      return q;
    },
  }),
}));

const { confirmPayment } = await import("@/lib/donations/confirm");
const { activateMonthlyDonation } = await import("@/lib/donations/recurring");
const { decrypt } = await import("@/lib/crypto");
const REF = "11111111-1111-1111-1111-111111111111";
const auth = { code: "AUTH_abc", reusable: true, last4: "4081", brand: "visa", expires: "12/2030" };
const paid = (authorization: typeof auth | null = auth) => ({ status: "success", amountCents: 20_000, currency: "ZAR", paidAt: "2026-10-15T08:00:00Z", authorization });

beforeEach(() => {
  recurring = { id: "rec1", status: "pending", charge_day: 15, first_donation_id: REF };
  donation = { id: REF, status: "pending", gateway: "test", total_charged_cents: 20_000, recurring_id: "rec1", gateway_ref: REF };
  failNextRecurringWrite = false;
  verify.mockReset();
  notify.mockClear();
});

describe("the first payment of a monthly donation", () => {
  it("starts the monthly donation: card kept encrypted, next collection next month, month one counted", async () => {
    verify.mockResolvedValue(paid());
    expect(await confirmPayment(REF)).toBe("paid");
    expect(recurring).toMatchObject({ status: "active", card_last4: "4081", card_brand: "visa", card_exp: "12/2030", last_paid_period: "2026-10", failed_attempts: 0, next_charge_at: "2026-11-15T06:00:00.000Z" });
    expect(recurring.authorization_encrypted).not.toContain("AUTH_abc");
    expect(decrypt(recurring.authorization_encrypted as string)).toBe("AUTH_abc");
    expect(notify).toHaveBeenCalledWith(REF, { monthly: "activated" });
  });

  it("a card that cannot be charged again keeps the gift but does not start the monthly donation", async () => {
    verify.mockResolvedValue(paid({ ...auth, reusable: false }));
    expect(await confirmPayment(REF)).toBe("paid");
    expect(recurring).toMatchObject({ status: "cancelled", ended_reason: "this payment method cannot be charged again" });
    expect(recurring.authorization_encrypted).toBeUndefined();
    expect(notify).toHaveBeenCalledWith(REF, { monthly: "not_reusable" });
  });

  it("no authorisation at all is the same as one that cannot be reused", async () => {
    verify.mockResolvedValue(paid(null));
    await confirmPayment(REF);
    expect(recurring.status).toBe("cancelled");
  });

  it("if the monthly set-up cannot be saved, the call fails so it is retried, and the retry finishes it", async () => {
    verify.mockResolvedValue(paid());
    failNextRecurringWrite = true;
    await expect(confirmPayment(REF)).rejects.toThrow();
    expect(donation.status).toBe("paid");
    expect(recurring.status).toBe("pending");
    expect(notify).not.toHaveBeenCalled();

    failNextRecurringWrite = false;
    expect(await confirmPayment(REF)).toBe("paid"); // the donation is already paid: only the set-up is finished
    expect(recurring.status).toBe("active");
  });

  it("a failed first payment means the monthly donation never starts", async () => {
    verify.mockResolvedValue({ status: "failed", amountCents: 0, currency: "ZAR" });
    expect(await confirmPayment(REF)).toBe("failed");
    expect(recurring).toMatchObject({ status: "cancelled", ended_reason: "the first payment failed" });
  });

  it("a later monthly payment does not start anything new, and says it is a repeat", async () => {
    recurring = { ...recurring, status: "active", first_donation_id: "some-other-first-donation" };
    verify.mockResolvedValue(paid());
    await confirmPayment(REF);
    expect(recurring.status).toBe("active");
    expect(notify).toHaveBeenCalledWith(REF, { monthly: "none" });
  });

  it("activating twice changes nothing the second time", async () => {
    expect(await activateMonthlyDonation(REF, paid() as never)).toBe("activated");
    expect(await activateMonthlyDonation(REF, paid({ ...auth, code: "AUTH_other" }) as never)).toBe("none");
    expect(decrypt(recurring.authorization_encrypted as string)).toBe("AUTH_abc");
  });
});
