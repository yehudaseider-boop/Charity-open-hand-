/**
 * The charity dashboard's speed (24/11/2026). Each page open waited for reads one after another where they could go
 * side by side. These count the rounds of trips (see tests/stubs/round-trips.ts): the dashboard frame and every page
 * (loadCharityForManager), and the Donors list's checks for the donors shown.
 */
import { describe, expect, it, vi } from "vitest";
import { taxYearFor } from "@/lib/dates";
import { answerWith, fakeDb, has, rounds, sent, type Answer } from "./stubs/round-trips";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/mfa", () => ({ requireSecondStep: async () => {} }));
vi.mock("@/lib/current-path", () => ({ currentNext: async (next: string) => next }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb }));
// Already known by the time a page reads its charity (the frame and requireViewer asked first, once per request).
vi.mock("@/lib/auth", () => ({
  claimedUserId: async () => "u1",
  getViewer: async () => ({ userId: "u1", email: "me@x.test", isPlatformAdmin: false, charities: [], managedCharityIds: [ID], agreedToCurrentPolicy: true }),
}));

const ID = "11111111-2222-3333-4444-555555555555";
const { loadCharityForManager } = await import("@/lib/charity/queries");
const { messagedThisWeek } = await import("@/lib/charity/weekly-limit");
const { optedOut } = await import("@/lib/charity/thank-you-send");
const { loadS18aMissing } = await import("@/lib/charity/s18a-reminder-send");
const { emailHash } = await import("@/lib/email-fingerprint");

describe("opening a charity's dashboard (every page, and the frame around it)", () => {
  const charity = (role: string, manager = true): Answer => (table, calls) => {
    if (table === "rpc:is_charity_admin") return { data: manager, error: null };
    if (table === "rpc:is_platform_admin") return { data: false, error: null };
    if (table === "charity_admins") return { data: { role }, error: null };
    if (table === "profiles") return { data: { role: "donor" }, error: null };
    if (table === "charities") return { data: { id: ID, name_en: "Meals", status: "approved" }, error: null };
    if (table === "charity_private")
      return has(calls, "select", "charity_id, contact_name, contact_email, contact_phone, notify_donations")
        ? { data: { charity_id: ID, contact_name: "Jo" }, error: null }
        : { data: { bank_name: "Bank", bank_account_holder: "Meals", bank_account_last4: "1234", bank_branch_code: "250655", bank_verified_at: null }, error: null };
    if (table === "charity_documents") return { data: has(calls, "eq", "document_type", "bank_confirmation") ? [{ id: "letter" }] : [], error: null };
    return { data: [], error: null };
  };

  it("checks access and reads the person's role in one round, then the rest in one: two rounds, not five", async () => {
    answerWith(charity("viewer"));
    const { result, rounds: n } = await rounds(() => loadCharityForManager(ID));
    expect(n).toBe(2);
    // A viewer learns that a bank account and the bank letter are there, never the account itself.
    expect(result.canBank).toBe(false);
    expect(result.priv).toMatchObject({ bank_set: true, bank_account_last4: null, bank_name: null, contact_name: "Jo" });
    expect(result.documentTypes).toContain("bank_confirmation");
  });

  it("gives the owner the bank account, in the same two rounds", async () => {
    answerWith(charity("owner"));
    const { result, rounds: n } = await rounds(() => loadCharityForManager(ID));
    expect(n).toBe(2);
    expect(result.canBank).toBe(true);
    expect(result.priv).toMatchObject({ bank_set: true, bank_account_last4: "1234", bank_name: "Bank" });
  });

  it("shows a stranger 'not found' and reads nothing about the charity", async () => {
    answerWith(charity("viewer", false));
    await expect(rounds(() => loadCharityForManager(ID))).rejects.toThrow("NEXT_NOT_FOUND");
    const tables = sent.map((s) => s.table);
    for (const t of ["charities", "charity_private", "charity_documents", "charity_categories"]) expect(tables).not.toContain(t);
  });
});

describe("the Donors list's checks for the donors shown", () => {
  it("finds who was messaged this week in three rounds, not five", async () => {
    answerWith((table) => {
      if (table === "donors") return { data: [{ id: "sarah", email: "sarah@x.co" }], error: null };
      if (table === "charity_thank_yous") return { data: [{ id: "t1" }], error: null };
      if (table === "charity_thank_you_recipients") return { data: [{ email_hash: emailHash("sarah@x.co"), email_hash_v: 2 }], error: null };
      return { data: [], error: null };
    });
    const donors = [{ donorId: "sarah", email: "sarah@x.co" }, { donorId: "david", email: "david@x.co" }];
    const { result, rounds: n } = await rounds(() => messagedThisWeek("c1", donors, new Date("2026-11-24T10:00:00+02:00")));
    expect(n).toBe(3);
    expect([...result]).toEqual(["sarah"]);
  });

  it("checks this charity's opt-outs and opt-outs from every charity in one round", async () => {
    answerWith(() => ({ data: [], error: null }));
    expect((await rounds(() => optedOut(["sarah@x.co"], "c1"))).rounds).toBe(1);
  });

  it("reads gifts with s18A details missing and the issued receipts in one round, not two", async () => {
    const now = new Date("2026-11-24T10:00:00+02:00");
    const details = { donor_type: "individual", id_number_encrypted: null, tax_reference_encrypted: null, registration_number: null, address_line1: null, erased_at: null };
    answerWith((table) =>
      table === "donations"
        ? { data: [{ id: "g1", status: "paid", wants_18a: true, tax_year: taxYearFor(now), donor_id: "sarah", amount_cents: 50_000, refunded_cents: 0, donation_checkout_details: details }], error: null, count: 1 }
        : { data: [], error: null, count: 0 },
    );
    const { result, rounds: n } = await rounds(() => loadS18aMissing("c1", now));
    expect(n).toBe(1);
    expect(result.has("sarah")).toBe(true);
  });
});
