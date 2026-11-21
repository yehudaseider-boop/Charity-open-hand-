/**
 * Review 21/11/2026, the charity's s18A receipt approval: gifts left off the list for a reason other than missing
 * details are shown to the charity, counted and grouped with what happens next; a list whose charity record lacks
 * what SARS needs on every receipt (its address, its SARS reference number) is never offered for approval or signed
 * off; and Givezy's admin page keeps its own words for the same reasons. The database is a stand-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharityRow } from "@/lib/receipts/details";
import type { PlanCharity, PlanDonation } from "@/lib/receipts/plan";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/config/receipts", async (orig) => ({ ...(await orig<object>()), receiptsEnabled: () => true }));

const charityBase: PlanCharity & CharityRow = {
  id: "c1", isS18a: true, mandateSignedAt: "2026-04-01T00:00:00+02:00", quickgive_code: "NMF",
  legal_name_en: "Northcliff Meals Fund NPC", npo_number: "1", pbo_number: "930012345", s18a_reference: "18A/1",
  address_line1: "1 Main Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192",
};
let charity: PlanCharity & CharityRow = charityBase;
const gift = (id: string, o: Partial<PlanDonation> = {}): PlanDonation => ({
  id, charityId: "c1", donorId: `u-${id}`, donorIdentity: "", taxYear: 2027, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2026-06-01T10:00:00Z", ...o,
});
let donations: PlanDonation[] = [];
let receipted = new Set<string>();
const NAMES: Record<string, string> = { g1: "Thandi Mokoena", g2: "Sipho Ndlovu", g3: "Anna van Wyk", g4: "Lerato Khumalo", g5: "Zanele Dube" };
const writes: { table: string; op: string }[] = [];
let run: Record<string, unknown> | null = null;

vi.mock("@/lib/receipts/store", () => ({
  supabaseReceiptStore: () => ({
    listDonations: async () => donations,
    listCharities: async () => [charity],
    receiptedDonationIds: async () => receipted,
    listDecisions: async () => [],
  }),
}));

/** Answers the few reads loadPlan and signOffRun make; records any write. */
function query(table: string) {
  let ids: string[] = [];
  const answer = () => {
    if (table === "donations") {
      return { data: ids.map((id) => ({ id, paid_at: "2026-06-01T10:00:00Z", donation_checkout_details: { donor_type: "individual", first_name: NAMES[id]?.split(" ")[0], last_name: NAMES[id]?.split(" ").slice(1).join(" "), organisation_name: null } })), error: null };
    }
    if (table === "receipt_runs") return { data: run, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "range", "lt", "gte", "limit"]) b[m] = () => b;
  b.in = (_c: string, v: string[]) => ((ids = v), b);
  for (const m of ["update", "insert", "upsert", "delete"]) b[m] = () => (writes.push({ table, op: m }), b);
  b.maybeSingle = async () => answer();
  b.single = async () => answer();
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer()).then(res, rej);
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => query(t) }) }));

const { loadPlan, approveRun, signOffRun, fingerprintPlan } = await import("@/lib/receipts/runs");
const { groupLeftOut, CHARITY_LEFT_OUT_WORDS, LEFT_OUT_REASONS } = await import("@/lib/receipts/left-out");
const { missingForCharity, missingForSars, charityMissingWords, charityMissingRefusal, adminCharityMissingWords, andList } = await import("@/lib/receipts/details");

beforeEach(() => {
  charity = charityBase;
  donations = [];
  receipted = new Set();
  writes.length = 0;
  run = null;
});

describe("gifts left off the list, as the charity sees them", () => {
  it("are counted and grouped by reason, with names, dates and amounts (less any part refunded), never contact details", async () => {
    donations = [
      gift("g1"),
      gift("g2", { receiptHold: "dispute open", refundedCents: 10_000 }),
      gift("g3", { receiptHold: "refund being reviewed" }),
      gift("g4", { paidAt: "2026-03-15T10:00:00Z" }), // before the mandate (01/04/2026)
      gift("g5", { donorId: "u-late" }),
      gift("g6", { donorId: "u-late", amountCents: 20_000 }),
    ];
    // u-late's receipt was issued with g5; g6 was paid after it.
    receipted = new Set(["g5"]);
    const plan = await loadPlan("c1", 2027);
    expect(plan.lines.map((l) => l.donorName)).toEqual(["Thandi Mokoena"]);
    expect(plan.leftOut.map((g) => g.reason)).toEqual(["on_hold", "late_after_receipt", "mandate_after_payment"]);
    const hold = plan.leftOut[0];
    expect(hold.lines.map((l) => l.donorName)).toEqual(["Anna van Wyk", "Sipho Ndlovu"]);
    expect(hold.amountCents).toBe(90_000);
    expect(plan.leftOut[1]).toMatchObject({ amountCents: 20_000, lines: [{ donorName: "Name missing", amountCents: 20_000 }] });
    expect(plan.leftOut[2].lines).toEqual([{ donorName: "Lerato Khumalo", paidAt: "2026-06-01T10:00:00Z", amountCents: 50_000 }]);
    expect(JSON.stringify(plan.leftOut)).not.toMatch(/@|email|phone|address/i);
    expect(plan.charityMissing).toEqual([]);
  });

  it("says nothing when every gift is on the list", async () => {
    donations = [gift("g1"), gift("g2")];
    expect((await loadPlan("c1", 2027)).leftOut).toEqual([]);
  });

  it("each reason says what it is and what happens next, in plain words", () => {
    for (const r of LEFT_OUT_REASONS) {
      const w = CHARITY_LEFT_OUT_WORDS[r];
      expect(w.what.length).toBeGreaterThan(10);
      expect(w.next).toMatch(/\.$/);
      expect(`${w.what} ${w.next}`).not.toMatch(/[!—]/);
    }
    expect(CHARITY_LEFT_OUT_WORDS.on_hold.what).toBe("On hold while a refund or dispute is checked");
    expect(CHARITY_LEFT_OUT_WORDS.on_hold.next).toMatch(/once Givezy clears it/);
  });

  it("groupLeftOut ignores reasons the charity has other lists for, or that need nothing", () => {
    const g = groupLeftOut(
      [{ donationId: "a", reason: "details_missing" }, { donationId: "b", reason: "fully_refunded" }, { donationId: "c", reason: "declined" }, { donationId: "d", reason: "on_hold" }],
      [{ id: "d", amountCents: 1_000, refundedCents: 250 }],
    );
    expect(g).toEqual([{ reason: "on_hold", donationIds: ["d"], amountCents: 750 }]);
  });
});

describe("a charity record without what SARS needs on every receipt", () => {
  it("is found before the list is shown: the address, and the SARS reference (s18A reference or PBO number)", () => {
    expect(missingForCharity(charityBase)).toEqual([]);
    expect(missingForCharity({ ...charityBase, address_line1: " ", city: null, postal_code: null })).toEqual(["the charity's address"]);
    expect(missingForCharity({ ...charityBase, s18a_reference: null, pbo_number: " " })).toEqual(["the charity's SARS reference number"]);
    expect(missingForCharity({ ...charityBase, s18a_reference: null })).toEqual([]);
    // The same rule the receipt itself is refused by.
    expect(missingForSars({ charity: { legal_name_en: "x", npo_number: null, pbo_number: null, s18a_reference: null, address: [] }, donor: { donor_type: "individual", name: "A B", registration_number: null, id_number_last4: null, tax_reference_last4: null, address: ["1 Rd"] }, donations: [], tax_year: 2027, period: "", wording: { title: "", statement: "" }, issued_on: "" }))
      .toEqual(["the charity's SARS reference number", "the charity's address"]);
  });

  it("puts the list on hold with one plain message, instead of showing it ready to approve", async () => {
    charity = { ...charityBase, address_line1: null, address_line2: null, suburb: null, city: null, postal_code: null, s18a_reference: null, pbo_number: null };
    donations = [gift("g1")];
    const plan = await loadPlan("c1", 2027);
    expect(plan.toIssue).toBe(1);
    expect(plan.charityMissing).toEqual(["the charity's SARS reference number", "the charity's address"]);
    const words = charityMissingWords(plan.charityMissing);
    expect(words).toBe("Your charity's SARS reference number and address aren't on your Givezy record yet, and SARS needs both on every s18A receipt, so none can be approved or issued. Nothing was approved or sent.");
    expect(charityMissingWords(["the charity's address"])).toMatch(/^Your charity's address isn't on your Givezy record yet, and SARS needs it/);
    expect(andList(["a", "b", "c"])).toBe("a, b and c");
    expect(charityMissingRefusal(["the charity's address"])).toBe("Your charity's address isn't on your Givezy record yet, and SARS needs it on every s18A receipt, so none can be approved or issued. Nothing was approved or sent. Send it to us and we'll add it, then approve again.");
  });

  it("tells Givezy's admin only what is true about putting it right (review 21/11/2026)", () => {
    const ref = "the charity's SARS reference number", address = "the charity's address";
    expect(adminCharityMissingWords([ref])).toBe("The charity's SARS reference number is missing from its record, and SARS needs it on every s18A receipt. Add the s18A reference number from the SARS letter in the s18A receipts box on the charity's page (Charities), then press Save.");
    expect(adminCharityMissingWords([address])).toBe("The charity's address is missing from its record, and SARS needs it on every s18A receipt. There's no form for this yet: ask the developer to correct it in the database.");
    expect(adminCharityMissingWords([ref, address])).toBe(
      "The charity's SARS reference number and address are missing from its record, and SARS needs both on every s18A receipt. Add the s18A reference number from the SARS letter in the s18A receipts box on the charity's page (Charities), then press Save. There's no form for the address yet: ask the developer to correct it in the database.",
    );
    expect(adminCharityMissingWords([])).toBe("");
    for (const m of [[ref], [address], [ref, address]]) expect(adminCharityMissingWords(m)).not.toMatch(/[!—]/);
  });

  it("asks nothing of a charity with no s18A gifts that year", async () => {
    charity = { ...charityBase, address_line1: null, city: null, postal_code: null };
    expect((await loadPlan("c1", 2027)).charityMissing).toEqual([]);
  });

  it("can't be approved: Approve all is refused before anything is written", async () => {
    charity = { ...charityBase, address_line1: null, city: null, postal_code: null };
    donations = [gift("g1")];
    const plan = await loadPlan("c1", 2027);
    const r = await approveRun({ charityId: "c1", taxYear: 2027, fingerprint: plan.fingerprint, userId: "admin1" });
    expect(r).toEqual({ ok: false, why: "charity_details", missing: ["the charity's address"] });
    expect(writes).toEqual([]);
  });

  it("can't be signed off either: nothing is claimed or issued, and the run stays waiting until the record is fixed", async () => {
    charity = { ...charityBase, s18a_reference: null, pbo_number: null };
    donations = [gift("g1")];
    const plan = await loadPlan("c1", 2027);
    run = { id: "run1", charity_id: "c1", tax_year: 2027, status: "charity_approved", plan_fingerprint: plan.fingerprint, receipts_planned: 1, total_cents: 50_000 };
    const r = await signOffRun({ runId: "run1", userId: "givezy1", now: new Date("2027-03-05T08:00:00+02:00") });
    expect(r).toMatchObject({
      ok: false,
      why: "charity_details",
      message: "Nothing was issued. The charity's SARS reference number is missing from its record, and SARS needs it on every s18A receipt. Add the s18A reference number from the SARS letter in the s18A receipts box on the charity's page (Charities), then press Save. Once that's done, sign off again.",
    });
    expect(writes).toEqual([]);
    expect(fingerprintPlan([])).toMatch(/^[0-9a-f]{64}$/);
  });
});
