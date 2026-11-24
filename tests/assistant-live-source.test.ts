/**
 * The helper's lookups for a real charity (review 22/11/2026): a donor erased at their request is never named (their
 * name is kept only for SARS), anonymous donors stay anonymous and can't be searched for, the setup steps count the
 * bank letter a role can't see, and the donor list is read once per question. The dashboard's queries are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let donorReads = 0;
const recent = [
  { status: "paid", amount_cents: 50_000, refunded_cents: 0, paid_at: "2026-11-20T10:00:00Z", created_at: "2026-11-20T10:00:00Z", is_anonymous: false, recurring_id: null, donor_id: "d1", donor_type: "individual", first_name: "Kept", last_name: "ForSars", organisation_name: null, email: "erased+abc@erased.invalid" },
  { status: "paid", amount_cents: 30_000, refunded_cents: 10_000, paid_at: "2026-11-19T10:00:00Z", created_at: "2026-11-19T10:00:00Z", is_anonymous: false, recurring_id: "r1", donor_id: "d3", donor_type: "individual", first_name: "Thandi", last_name: "Mokoena", organisation_name: null, email: null },
  // An open gift from a donor who gave anonymously another time: anonymous on the Donors page, so never named here.
  { status: "paid", amount_cents: 10_000, refunded_cents: 0, paid_at: "2026-11-18T10:00:00Z", created_at: "2026-11-18T10:00:00Z", is_anonymous: false, recurring_id: null, donor_id: "d2", donor_type: "individual", first_name: "Quiet", last_name: "Giver", organisation_name: null, email: null },
];
const monthlyRows = vi.hoisted(() => ({ rows: [] as { recurring_id: string; status: string; amount_cents: number; ended_at: string | null }[] }));
const reads = vi.hoisted(() => ({ from: [] as string[], eq: [] as unknown[][] }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      reads.from.push(table);
      const q = { select: () => q, eq: (...a: unknown[]) => (reads.eq.push(a), q), in: () => q, order: () => q, limit: async () => ({ data: recent, error: null }) };
      return q;
    },
  }),
}));
vi.mock("@/lib/charity/s18a-reminder-send", () => ({ loadS18aMissing: async () => new Map([["d3", ["address", "id_number"]]]) }));
vi.mock("@/lib/charity/dashboard-queries", () => ({
  loadDonors: async () => {
    donorReads++;
    return [
      { donor_id: "d1", display_name: "Kept ForSars", email: "erased+abc@erased.invalid", donation_count: 2, total_cents: 90_000, first_paid_at: "2026-03-02T10:00:00Z", last_paid_at: "2026-11-20T10:00:00Z", is_anonymous: false },
      { donor_id: "d2", display_name: "Quiet Giver", email: null, donation_count: 1, total_cents: 60_000, first_paid_at: "2026-05-02T10:00:00Z", last_paid_at: "2026-05-02T10:00:00Z", is_anonymous: true },
      { donor_id: "d3", display_name: "Thandi Mokoena", email: null, donation_count: 4, total_cents: 40_000, first_paid_at: "2026-04-02T10:00:00Z", last_paid_at: "2026-11-19T10:00:00Z", is_anonymous: false },
    ];
  },
  loadMonthlyGifts: async () => [{ donor_id: "d3", recurring_id: "r1" }],
  loadOverview: async () => ({}),
  loadMonthlyTotals: async () => [],
  loadMonthlyDonations: async () => monthlyRows.rows,
  loadReceiptGifts: async () => ({ gifts: [], onIssued: new Set() }),
}));
vi.mock("@/lib/charity/queries", () => ({
  loadCharityForManager: async () => ({
    charity: { status: "draft", name_en: "Meals", legal_name_en: "Meals NPC", npo_number: "1", pbo_number: null, s18a_reference: null, address_line1: "1 Main", city: "Joburg", postal_code: "2000" },
    priv: { contact_name: "Jo", contact_email: "jo@x.co", bank_account_last4: null, bank_branch_code: null, bank_set: true },
    // The admin's own read can't see the bank letter; documentTypes counts it.
    documents: [{ document_type: "npo_certificate" }],
    documentTypes: ["npo_certificate", "bank_confirmation"],
  }),
  loadStories: async () => ({ updates: [] }),
}));
vi.mock("@/lib/charity/start-facts", () => ({ loadStartFacts: async () => ({ charity: {}, bank: null, s18a: { issues: false, sarsDetails: null }, journeyOn: null, updates: 0, teamSize: null }) }));
vi.mock("@/lib/charity/team", () => ({ viewerRole: async () => "admin" }));

const { liveSource } = await import("@/lib/assistant/live-source");
const { checkToolCall, runTool } = await import("@/lib/assistant/tools");
const ask = async (name: string, input: unknown) => {
  const call = checkToolCall(name, input, true);
  if (!call.ok) throw new Error(call.error);
  return JSON.stringify(JSON.parse(await runTool(call, src, true)));
};
let src = liveSource("11111111-2222-3333-4444-555555555555");
beforeEach(() => {
  donorReads = 0;
  monthlyRows.rows = [];
  src = liveSource("11111111-2222-3333-4444-555555555555");
});

describe("donors the helper may never name", () => {
  it("an erased donor is never named, in recent gifts or the donor list", async () => {
    const gifts = await ask("recent_gifts", { limit: 5 });
    expect(gifts).not.toContain("Kept");
    expect(gifts).toContain("Erased at the donor's request");
    expect(gifts).toContain("Thandi Mokoena");
    expect(gifts).not.toContain("erased.invalid");
    const top = await ask("top_donors", { limit: 5 });
    expect(top).not.toMatch(/Kept|ForSars|Quiet Giver/);
  });

  it("can't be found by searching, and nor can an anonymous donor", async () => {
    expect(await ask("find_donor", { name: "Kept" })).toContain('"found":0');
    expect(await ask("find_donor", { name: "Quiet" })).toContain('"found":0');
    expect(await ask("find_donor", { name: "anon" })).toContain('"found":0');
    expect(await ask("find_donor", { name: "thandi" })).toContain("Thandi Mokoena");
  });

  it("never names a donor on an open gift when that donor gave anonymously another time (review 24/11/2026)", async () => {
    const gifts = JSON.parse(await ask("recent_gifts", { limit: 5 }));
    expect(JSON.stringify(gifts)).not.toMatch(/Quiet|Giver/);
    expect(gifts[2]).toMatchObject({ amount: "R100", donor: "Anonymous" });
  });

  it("a part refund shows what is left of the gift", async () => {
    expect(await ask("recent_gifts", { limit: 5 })).toContain('"amount":"R200"');
  });

  it("reads the donor list once per question, however many lookups use it", async () => {
    await ask("top_donors", { limit: 3 });
    await ask("find_donor", { name: "thandi" });
    expect(donorReads).toBe(1);
  });
});

describe("names, one donor at a time (24/11/2026)", () => {
  it("answers about a named donor, and never finds an erased or anonymous one", async () => {
    expect(await ask("donor_giving", { name: "Kept", last_gift: "" })).toContain('"found":0');
    expect(await ask("donor_giving", { name: "Quiet", last_gift: "" })).toContain('"found":0');
    const t = JSON.parse(await ask("donor_giving", { name: "thandi", last_gift: "" }));
    expect(t).toMatchObject({ name: "Thandi Mokoena", asked_for_an_s18a_receipt: false });
    // The gifts are read for this charity and this donor only.
    expect(reads.eq).toEqual(expect.arrayContaining([["charity_id", "11111111-2222-3333-4444-555555555555"], ["donor_id", "d3"]]));
  });

  it("never reads gifts or contact details for a donor outside this charity's own list", async () => {
    reads.from = [];
    expect(await src.donorGifts!("someone-elses-donor")).toMatchObject({ gifts: [] });
    expect(reads.from).toEqual([]);
    expect(await src.donorContact!("someone-elses-donor")).toEqual({ email: null, phone: null });
  });

  it("gives no contact details for an anonymous donor, and an erased one's placeholder only", async () => {
    expect(await src.donorContact!("d2")).toEqual({ email: null, phone: null });
    const erased = await src.donorContact!("d1");
    expect(erased.email).toMatch(/erased\.invalid$/);
    const call = checkToolCall("donor_contact", { name: "Kept", last_gift: "" }, true, false, true);
    if (!call.ok) throw new Error(call.error);
    // Not even findable by name.
    expect(await runTool(call, src, true)).toContain('"found":0');
  });

  it("lists who still has s18A details missing, by what is missing, in words", async () => {
    const out = JSON.parse(await ask("donor_list", { list: "s18a_details_missing" }));
    expect(out.donors).toEqual([{ name: "Thandi Mokoena", still_needed: ["address", "SA ID number"] }]);
  });
});

describe("gives monthly, as the Donors page's badge (review 24/11/2026)", () => {
  const thandi = async () => (JSON.parse(await ask("top_donors", { limit: 5 })) as { name: string; gives_monthly?: boolean }[]).find((d) => d.name === "Thandi Mokoena");
  it("is false when their monthly donation has ended, though they once gave monthly", async () => {
    monthlyRows.rows = [{ recurring_id: "r1", status: "cancelled", amount_cents: 10_000, ended_at: "2026-11-01T10:00:00Z" }];
    expect(await thandi()).toMatchObject({ gives_monthly: false });
  });
  it("is true while one is running", async () => {
    monthlyRows.rows = [{ recurring_id: "r1", status: "active", amount_cents: 10_000, ended_at: null }];
    expect(await thandi()).toMatchObject({ gives_monthly: true });
  });
});

describe("setup", () => {
  it("counts the bank letter an admin can't see, so it isn't asked for again", async () => {
    const s = await ask("setup_progress", {});
    expect(s).not.toContain("Bank confirmation letter");
  });
});
