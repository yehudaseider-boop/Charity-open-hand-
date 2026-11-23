/**
 * A donation's page on the dashboard (code review, 23/11/2026): when the receipt it is on (or the donation itself)
 * can't be read, the page goes to the error page ("Try again"). It never shows "Not issued yet", never offers Remove
 * for a gift that may be on a receipt, and never says "not found".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const DONATION = "11111111-1111-4111-8111-111111111111";
let donationError: { message: string } | null = null;
let receiptError: { message: string } | null = null;

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); }, redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1" } }) }));
vi.mock("@/app/charity-admin/[id]/donations/record-actions", () => ({ removeRecordedGifts: async () => ({ ok: true }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => (table === "charity_receipt_donations" ? Promise.resolve({ data: receiptError ? null : [], error: receiptError }) : q);
      q.maybeSingle = async () => ({
        data: donationError ? null : { id: DONATION, status: "paid", amount_cents: 5000, refunded_cents: 0, created_at: "2026-11-01T10:00:00Z", paid_at: "2026-11-01T10:00:00Z", recorded_method: "eft", campaign_id: null, first_name: "A", last_name: "B", donor_type: "individual", email: "a@x.test" },
        error: donationError,
      });
      return q;
    },
  }),
}));

const { default: DonationPage } = await import("@/app/charity-admin/[id]/donations/[donationId]/page");
const open = () => DonationPage({ params: Promise.resolve({ id: "c1", donationId: DONATION }) } as never);

beforeEach(() => {
  donationError = null;
  receiptError = null;
});

describe("a donation's page when a read fails", () => {
  it("the receipt can't be read: the error page, not 'Not issued yet' or Remove", async () => {
    receiptError = { message: "connection reset" };
    await expect(open()).rejects.toThrow(/Receipt not read: connection reset/);
  });

  it("the donation can't be read: the error page, not 'not found'", async () => {
    donationError = { message: "timeout" };
    await expect(open()).rejects.toThrow(/Donation not read: timeout/);
  });

  it("both read: the page is built", async () => {
    await expect(open()).resolves.toBeTruthy();
  });
});
