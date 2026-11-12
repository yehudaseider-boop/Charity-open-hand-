/**
 * A gift's confirmation is noted as owed (on the email retry list) before the gift is saved as paid, and the note is
 * closed once the confirmation went, so a process that stops in between still sends it, and it never goes twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const retry = { recorded: [] as string[], gone: [] as string[] };
let readFails = false;
vi.mock("@/lib/email/retry", () => ({
  recordFailedEmail: async (kind: string, id: string) => void retry.recorded.push(`${kind}:${id}`),
  markRetryGone: async (kind: string, id: string) => void retry.gone.push(`${kind}:${id}`),
}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async () => "sent" }) }));
vi.mock("@/lib/charity/emails", () => ({ notifyCharity: async () => {}, donationReceivedEmail: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const q = {
      from: () => q,
      select: () => q,
      eq: () => q,
      // Not paid (yet): nothing to send, which counts as done. A read that fails is a failed send.
      single: async () => (readFails ? { data: null, error: new Error("down") } : { data: { id: "d1", status: "pending", paid_at: null, charities: { name_en: "Meals" }, donation_checkout_details: null }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return q;
  },
}));

const { notifyDonationPaid, oweDonorConfirmation } = await import("@/lib/donations/notify");

beforeEach(() => {
  retry.recorded.length = 0;
  retry.gone.length = 0;
  readFails = false;
});

describe("the owed confirmation", () => {
  it("is noted on the retry list, as a confirmation for this gift", async () => {
    await oweDonorConfirmation("d1");
    expect(retry.recorded).toEqual(["donation_confirmation:d1"]);
  });

  it("is closed once the confirmation went (or there was nothing to send)", async () => {
    await notifyDonationPaid("d1");
    expect(retry.gone).toEqual(["donation_confirmation:d1"]);
  });

  it("stays open when the send failed, so the daily job sends it", async () => {
    readFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyDonationPaid("d1");
    expect(retry.gone).toEqual([]);
    expect(retry.recorded).toEqual(["donation_confirmation:d1"]);
  });
});
