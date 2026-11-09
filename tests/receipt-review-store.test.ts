/**
 * The server side of the charity's check of each s18A receipt (09/11/2026), with the database replaced by a
 * stand-in: a correction never reaches amounts or ID numbers and is refused once a gift is on an issued receipt,
 * a decline emails the donor the charity's phone and email (and never without them), and nothing changes while
 * the list is with Givezy. The database function itself is checked in receipt-review-db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DonorRow } from "@/lib/receipts/details";
import type { PlannedReceipt } from "@/lib/receipts/plan";
import { applyDecisions, type StoredDecision } from "@/lib/receipts/review";

vi.mock("server-only", () => ({}));

const audits: { action: string; details?: Record<string, unknown> }[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
const writes: { table: string; op: string; payload?: unknown }[] = [];
const mails: { to: string; subject: string; text: string; replyTo?: string }[] = [];
let rpcError: string | null = null;
let run: { id: string; status: string; charity_approved_at: string } | null = null;
let decisions: StoredDecision[] = [];
let email = "thandi@example.co.za";

const planned: PlannedReceipt = { charityId: "c1", donorId: "u1", donorIdentity: "idfp", taxYear: 2027, donationIds: ["g1", "g2"], totalCents: 75_000 };
const donor: DonorRow = {
  donor_type: "individual", first_name: "Thandi", last_name: "Mokoena", organisation_name: null, registration_number: null,
  address_line1: "5 Old Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192", id_number_last4: "9085", tax_reference_last4: null,
};
const gift = (id: string, paidAt: string) => ({
  id, paid_at: paidAt,
  donation_checkout_details: { donor_type: "individual", email, first_name: "Thandi", last_name: "Mokoena", organisation_name: null, address_line1: "5 Old Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192" },
});

vi.mock("@/lib/receipts/runs", () => ({
  decidedPlan: async () => ({ receipts: applyDecisions([planned], decisions), skipped: [], donations: [] }),
  openRun: async () => run,
}));
vi.mock("@/lib/receipts/store", () => ({
  supabaseReceiptStore: () => ({
    listCharities: async () => [{ id: "c1", isS18a: true, mandateSignedAt: "2026-03-01T00:00:00Z", quickgive_code: "NMF", legal_name_en: "Northcliff Meals Fund NPC", npo_number: "1", pbo_number: "2", s18a_reference: "3", address_line1: "1 Rd", address_line2: null, suburb: null, city: "Jhb", postal_code: "2000" }],
    donorDetailsFor: async (ids: string[]) => ids.map((id, i) => ({ id, paidAt: `2026-0${i + 5}-01T10:00:00Z`, amountCents: i ? 25_000 : 50_000, recordedMethod: null, donor })),
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: async (a: { action: string; details?: Record<string, unknown> }) => void audits.push(a) }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<object>()),
  getEmailTransport: () => ({ name: "test", send: async (m: { to: string; subject: string; text: string; replyTo?: string }) => (mails.push(m), "sent") }),
}));

/** A stand-in for the service-role client: answers each table the way the code reads it, and records writes. */
function query(table: string) {
  let op = "select";
  let payload: unknown;
  const answer = () => {
    if (table === "donations") return { data: [gift("g1", "2026-05-01T10:00:00Z"), gift("g2", "2026-06-01T10:00:00Z")], error: null };
    if (table === "charities") return { data: { name_en: "Northcliff Meals Fund" }, error: null };
    if (table === "receipt_plan_decisions" && op === "upsert") return { data: { id: "dec1", decided_at: "2027-03-02T08:00:00+00:00" }, error: null };
    if (table === "receipt_plan_decisions" && op === "delete") return { data: [{ id: "dec1", decision: "declined" }], error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "is", "order", "range"]) b[m] = () => b;
  b.upsert = (p: unknown) => ((op = "upsert"), (payload = p), writes.push({ table, op, payload }), b);
  b.update = (p: unknown) => ((op = "update"), (payload = p), writes.push({ table, op, payload }), b);
  b.delete = () => ((op = "delete"), writes.push({ table, op }), b);
  b.maybeSingle = async () => answer();
  b.single = async () => answer();
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer()).then(res, rej);
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => query(t),
    rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: 2, error: rpcError ? { message: rpcError } : null }),
  }),
}));

const { approveCertificate, declineCertificate, editCertificate, loadCertificate, reopenCertificate, reviewFailureText } = await import("@/lib/receipts/review-store");
const { certificateKey, certificateFingerprint } = await import("@/lib/receipts/review");
const key = certificateKey("c1", 2027, "u1", "idfp");
const args = { charityId: "c1", taxYear: 2027, key, userId: "admin1" };
const contact = { phone: "011 555 0101", email: "office@meals.org.za" };

beforeEach(() => {
  audits.length = rpcs.length = writes.length = mails.length = 0;
  rpcError = null;
  run = null;
  decisions = [];
  email = "thandi@example.co.za";
  process.env.SITE_URL = "https://givezy.test";
});

describe("the preview of one planned receipt", () => {
  it("is found by its key only, and built exactly as the receipt will be", async () => {
    const c = await loadCertificate("c1", 2027, key);
    expect(c?.donorName).toBe("Thandi Mokoena");
    expect(c?.details.donations.map((d) => d.amount_cents)).toEqual([50_000, 25_000]);
    expect(await loadCertificate("c1", 2027, "f".repeat(32))).toBeNull();
    expect(await loadCertificate("c1", 2027, "u1")).toBeNull();
  });
});

describe("correcting the name and address", () => {
  const typed = { first_name: "Thandi", last_name: "Mokoena-Dlamini", address_line1: "12 New Street", suburb: "Melville", city: "Johannesburg", postal_code: "2092" };

  it("writes only name and address columns to each gift, never an amount or an ID number, then marks it edited", async () => {
    const r = await editCertificate({ ...args, input: { ...typed, id_number: "8001015009087", amount_cents: "1", registration_number: "x", email: "x@y.co" } });
    expect(r.ok).toBe(true);
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].fn).toBe("correct_receipt_donor_details");
    const rows = rpcs[0].args.p_rows as { donation_id: string; expect: Record<string, unknown>; set: Record<string, unknown> }[];
    expect(rows.map((x) => x.donation_id).sort()).toEqual(["g1", "g2"]);
    const allowed = ["first_name", "last_name", "organisation_name", "address_line1", "address_line2", "suburb", "city", "postal_code"];
    for (const x of rows) {
      expect(Object.keys(x.set).every((k) => allowed.includes(k))).toBe(true);
      expect(Object.keys(x.expect).every((k) => allowed.includes(k))).toBe(true);
      expect(x.set).toEqual({ last_name: "Mokoena-Dlamini", address_line1: "12 New Street", suburb: "Melville", postal_code: "2092" });
    }
    const up = writes.find((w) => w.table === "receipt_plan_decisions" && w.op === "upsert")?.payload as Record<string, unknown>;
    expect(up).toMatchObject({ decision: "edited", donor_id: "u1", donor_identity: "idfp", certificate_fingerprint: certificateFingerprint(planned) });
    // The audit log says what changed, never the personal data.
    const a = audits.find((x) => x.action === "receipts.certificate_edited");
    expect(a?.details).toEqual({ taxYear: 2027, certificate: key, changed: ["name", "address"], gifts: 2 });
    expect(JSON.stringify(audits)).not.toMatch(/Mokoena|Street|Melville|2092/);
  });

  it("is refused once a gift is on an issued receipt, and nothing is marked", async () => {
    rpcError = "receipt_details_issued";
    const r = await editCertificate({ ...args, input: typed });
    expect(r).toEqual({ ok: false, why: "issued" });
    expect(writes.filter((w) => w.table === "receipt_plan_decisions")).toEqual([]);
    expect(audits).toEqual([]);
    expect(reviewFailureText("issued")).toMatch(/already on an issued s18A receipt.*Nothing was changed/);
  });

  it("refuses an incomplete address with the fields to fix, and writes nothing", async () => {
    const r = await editCertificate({ ...args, input: { ...typed, address_line1: "" } });
    expect(r).toMatchObject({ ok: false, why: "invalid", fieldErrors: { address_line1: expect.any(String) } });
    expect(rpcs).toEqual([]);
  });

  it("with nothing different, approves it without touching the gifts", async () => {
    const r = await editCertificate({ ...args, input: { first_name: "Thandi", last_name: "Mokoena", address_line1: "5 Old Road", city: "Johannesburg", postal_code: "2192" } });
    expect(r).toMatchObject({ ok: true, changed: [] });
    expect(rpcs).toEqual([]);
    expect(writes.find((w) => w.op === "upsert")?.payload).toMatchObject({ decision: "approved" });
  });
});

describe("while the list is with Givezy", () => {
  it("nothing can be approved, declined, corrected or reopened", async () => {
    run = { id: "run1", status: "charity_approved", charity_approved_at: "2027-03-02T08:00:00Z" };
    decisions = [{ id: "dec1", charityId: "c1", taxYear: 2027, donorId: "u1", donorIdentity: "idfp", decision: "approved", certificateFingerprint: certificateFingerprint(planned), decidedAt: "x" }];
    expect(await approveCertificate(args)).toEqual({ ok: false, why: "run_open" });
    expect(await declineCertificate({ ...args, contact })).toEqual({ ok: false, why: "run_open" });
    expect(await editCertificate({ ...args, input: {} })).toEqual({ ok: false, why: "run_open" });
    expect(await reopenCertificate(args)).toEqual({ ok: false, why: "run_open" });
    expect(writes).toEqual([]);
    expect(mails).toEqual([]);
  });
});

describe("declining a receipt", () => {
  it("is refused without the charity's contact phone and email, and nothing is sent", async () => {
    expect(await declineCertificate({ ...args, contact: { phone: "", email: "office@meals.org.za" } })).toEqual({ ok: false, why: "no_contact" });
    expect(await declineCertificate({ ...args, contact: { phone: "011", email: null } })).toEqual({ ok: false, why: "no_contact" });
    expect(writes).toEqual([]);
    expect(mails).toEqual([]);
  });

  it("marks it declined, emails the donor the charity's phone and email (replies go to the charity), and records it", async () => {
    const r = await declineCertificate({ ...args, contact });
    expect(r).toMatchObject({ ok: true, emailed: "sent" });
    expect(writes.find((w) => w.op === "upsert")?.payload).toMatchObject({ decision: "declined" });
    expect(writes.find((w) => w.op === "update")?.payload).toHaveProperty("decline_emailed_at");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "thandi@example.co.za", replyTo: "office@meals.org.za" });
    expect(mails[0].text).toContain("011 555 0101");
    expect(mails[0].text).not.toContain("!");
    expect(audits.map((a) => a.action)).toEqual(["receipts.certificate_declined", "receipts.certificate_decline_email"]);
  });

  it("sends the email again only when it didn't go the first time", async () => {
    decisions = [{ id: "dec1", charityId: "c1", taxYear: 2027, donorId: "u1", donorIdentity: "idfp", decision: "declined", certificateFingerprint: "x".repeat(64), decidedAt: "x", declineEmailedAt: "2027-03-02T08:00:00Z" }];
    expect(await declineCertificate({ ...args, contact })).toEqual({ ok: false, why: "already" });
    decisions = [{ ...decisions[0], declineEmailedAt: null }];
    const r = await declineCertificate({ ...args, contact });
    expect(r).toMatchObject({ ok: true, emailed: "sent" });
    expect(writes.filter((w) => w.op === "upsert")).toEqual([]);
    expect(mails).toHaveLength(1);
  });

  it("says so when there is no address to email", async () => {
    email = "erased-abc@erased.invalid";
    const r = await declineCertificate({ ...args, contact });
    expect(r).toMatchObject({ ok: true, emailed: "no_address" });
    expect(mails).toEqual([]);
  });
});

describe("reopening", () => {
  it("puts a declined receipt back to check, without emailing, and hands back what it removed for Undo", async () => {
    decisions = [{ id: "dec1", charityId: "c1", taxYear: 2027, donorId: "u1", donorIdentity: "idfp", decision: "declined", certificateFingerprint: "x".repeat(64), decidedAt: "x" }];
    const r = await reopenCertificate(args);
    expect(r).toMatchObject({ ok: true, removed: { id: "dec1", decision: "declined" } });
    expect(mails).toEqual([]);
    expect(audits[0]).toMatchObject({ action: "receipts.certificate_reopened", details: { was: "declined" } });
  });
  it("has nothing to do for a receipt still to check", async () => {
    expect(await reopenCertificate(args)).toEqual({ ok: false, why: "already" });
  });
});
