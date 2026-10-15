/** The charity hears about a paid donation, unless it turned the emails off; it never gets donor details. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string; text: string }[] = [];
let notifyOn = true;
const rows: Record<string, unknown> = {
  donations: {
    id: "d1", amount_cents: 18_000, contribution_cents: 1_000, total_charged_cents: 19_000, paid_at: "2026-10-16T08:00:00Z",
    wants_18a: false, recurring_id: null, dedication_kind: null, dedication_name: null, charity_id: "c1", campaign_id: null,
    charities: { name_en: "Meals Fund" }, donation_checkout_details: { email: "donor@x.co" },
  },
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) b[m] = () => b;
      b.single = async () => ({ data: rows[table], error: null });
      b.maybeSingle = async () => ({ data: table === "charity_private" ? { contact_email: "charity@x.co", notify_donations: notifyOn } : null, error: null });
      return b;
    },
  }),
}));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async (m: { to: string; subject: string; text: string }) => void sent.push(m) }) }));

const { notifyDonationPaid } = await import("@/lib/donations/notify");

beforeEach(() => {
  sent.length = 0;
  notifyOn = true;
});

describe("charity donation email", () => {
  it("emails the donor and then the charity, with the gift only (not the contribution) and no donor details", async () => {
    await notifyDonationPaid("d1");
    expect(sent.map((m) => m.to)).toEqual(["donor@x.co", "charity@x.co"]);
    const charityMail = sent[1];
    expect(charityMail.subject).toBe("Meals Fund received R180 on Givezy");
    expect(charityMail.text).not.toContain("donor@x.co");
    expect(charityMail.text).not.toContain("R190");
  });
  it("sends nothing to the charity when it turned these emails off", async () => {
    notifyOn = false;
    await notifyDonationPaid("d1");
    expect(sent.map((m) => m.to)).toEqual(["donor@x.co"]);
  });
});
