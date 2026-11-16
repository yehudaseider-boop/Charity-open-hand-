/**
 * A gift's confirmation is noted as owed (on the email retry list) before the gift is saved as paid, and the note is
 * closed once the confirmation went, so a process that stops in between still sends it, and it never goes twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const retry = { recorded: [] as string[], gone: [] as string[], unknown: [] as string[] };
let readFails = false;
/** What the retry list already says about this gift's confirmation (sent by a try again, and so on). */
let handled = false;
let sendCutOff = false;
const sends: string[] = [];
const { MaybeSent } = vi.hoisted(() => ({ MaybeSent: class EmailMaybeSent extends Error {} }));
vi.mock("@/lib/email/retry", () => ({
  recordFailedEmail: async (kind: string, id: string) => void retry.recorded.push(`${kind}:${id}`),
  markRetryGone: async (kind: string, id: string) => void retry.gone.push(`${kind}:${id}`),
  markRetryUnknown: async (kind: string, id: string) => void retry.unknown.push(`${kind}:${id}`),
  alreadyHandled: async () => handled,
}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({
  EmailError: class EmailError extends Error {},
  EmailMaybeSent: MaybeSent,
  getEmailTransport: () => ({
    send: async (m: { to: string }) => {
      if (sendCutOff) throw new MaybeSent("fetch failed");
      sends.push(m.to);
      return "sent";
    },
  }),
}));
vi.mock("@/lib/charity/emails", () => ({ notifyCharity: async () => {}, donationReceivedEmail: () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const q = {
      from: () => q,
      select: () => q,
      eq: () => q,
      // Not paid (yet): nothing to send, which counts as done. A read that fails is a failed send.
      single: async () =>
        readFails
          ? { data: null, error: new Error("down") }
          : paid
            ? { data: { id: "d1", status: "paid", paid_at: "2026-11-12T08:00:00Z", amount_cents: 10000, contribution_cents: 0, processing_charge_cents: 0, total_charged_cents: 10000, wants_18a: false, recurring_id: null, charities: { name_en: "Meals", thank_you_en: null }, donation_checkout_details: { email: "dana@example.com" } }, error: null }
            : { data: { id: "d1", status: "pending", paid_at: null, charities: { name_en: "Meals" }, donation_checkout_details: null }, error: null },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return q;
  },
}));

const { notifyDonationPaid, oweDonorConfirmation } = await import("@/lib/donations/notify");

let paid = false;
beforeEach(() => {
  retry.recorded.length = 0;
  retry.gone.length = 0;
  retry.unknown.length = 0;
  sends.length = 0;
  readFails = false;
  handled = false;
  sendCutOff = false;
  paid = false;
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

  it("is never sent a second time when the retry list says it already went (or may have)", async () => {
    paid = true;
    handled = true;
    await notifyDonationPaid("d1");
    expect(sends).toEqual([]);
    paid = true;
    handled = false;
    await notifyDonationPaid("d1");
    expect(sends).toEqual(["dana@example.com"]);
    expect(retry.gone).toEqual(["donation_confirmation:d1"]);
  });

  it("a send cut off mid-way is noted as 'may have gone', never put back to be sent again", async () => {
    paid = true;
    sendCutOff = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyDonationPaid("d1");
    expect(retry.unknown).toEqual(["donation_confirmation:d1"]);
    expect(retry.recorded).toEqual([]);
    expect(retry.gone).toEqual([]);
  });
});
