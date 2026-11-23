/**
 * A receipt email that may already have gone is never sent again by a run (13/11/2026): once the send was cut off or
 * dropped mid-way and flagged for a person ("unknown" in the email retries), claiming it fails, however old the claim
 * is. Before, a claim older than 15 minutes was taken over and the receipt emailed a second time.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseReceiptStore } from "@/lib/receipts/store";
import { runReceiptsJob, type IssuedReceipt, type ReceiptStore } from "@/lib/receipts/issue";

function fakeDb(opts: { flagged: boolean }) {
  const claims: unknown[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "or", "order", "range"]) q[m] = () => q;
    q.update = (row: unknown) => (claims.push(row), q);
    q.limit = async () => ({ data: table === "email_retries" && opts.flagged ? [{ id: 1 }] : [], error: null });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "s18a_receipts" ? [{ id: "r1" }] : [], error: null }).then(ok);
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, claims };
}

const receipt = { id: "r1", charityId: "c1", reference: "NMF-2027-0001", details: {}, pdfPath: "c1/r1.pdf" } as unknown as IssuedReceipt;

describe("claiming a receipt email", () => {
  it("a receipt whose send may have gone is never claimed again", async () => {
    const { db, claims } = fakeDb({ flagged: true });
    expect(await supabaseReceiptStore(db).claimEmail(receipt)).toBe(false);
    expect(claims).toHaveLength(0);
  });

  it("any other receipt is claimed as before", async () => {
    const { db, claims } = fakeDb({ flagged: false });
    expect(await supabaseReceiptStore(db).claimEmail(receipt)).toBe(true);
    expect(claims).toHaveLength(1);
  });
});

/**
 * Review 23/11/2026: a receipt withdrawn (made void) between being listed and being claimed. The database refuses any
 * change to a void row (guard_receipt_immutable), so every email-step write is narrowed to issued receipts: a void one
 * is simply skipped, and one receipt's failed claim never stops the others' emails.
 */
function voidDb() {
  const writes: { patch: unknown; filters: Record<string, unknown> }[] = [];
  const row = { id: "r1", status: "void" };
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let patch: unknown = null;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "is", "or", "order", "range"]) q[m] = () => q;
    q.eq = (c: string, v: unknown) => ((filters[c] = v), q);
    q.update = (p: unknown) => ((patch = p), q);
    q.limit = async () => ({ data: [], error: null });
    q.then = (ok: (v: unknown) => unknown) => {
      if (table === "s18a_receipts" && patch) {
        writes.push({ patch, filters });
        // As the trigger: a change that reaches a void row raises; one filtered to issued rows matches nothing.
        if (filters.status === "issued" && row.status !== "issued") return Promise.resolve({ data: [], error: null }).then(ok);
        return Promise.resolve({ data: null, error: { message: "A void receipt cannot be changed" } }).then(ok);
      }
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return q;
  };
  const storage = { from: () => ({ upload: async () => ({ error: null }) }) };
  return { db: { from, storage } as unknown as SupabaseClient, writes };
}

const DETAILS = { donor: { donor_type: "individual", name: "Ann Smith" }, charity: { legal_name_en: "Test Charity NPC" }, donations: [{ amount_cents: 10_000 }], period: "the 2026/27 tax year" };

describe("a receipt withdrawn while the run is emailing", () => {
  it("is not claimed, and marking, releasing or saving its PDF changes nothing and never throws", async () => {
    const { db, writes } = voidDb();
    const store = supabaseReceiptStore(db);
    expect(await store.claimEmail(receipt)).toBe(false);
    await expect(store.markEmailed(receipt)).resolves.toBeUndefined();
    await expect(store.releaseEmail(receipt)).resolves.toBeUndefined();
    await expect(store.savePdf(receipt, Buffer.from("%PDF"))).resolves.toBeUndefined();
    expect(writes).toHaveLength(4);
    for (const w of writes) expect(w.filters.status).toBe("issued");
  });

  it("one receipt whose claim fails never stops the other receipts' emails, and nothing is released or flagged for it", async () => {
    const a = { ...receipt, id: "a", reference: "NMF-2027-0001", email: "a@x.co", details: DETAILS } as unknown as IssuedReceipt & { email: string };
    const b = { ...receipt, id: "b", reference: "NMF-2027-0002", email: "b@x.co", details: DETAILS } as unknown as IssuedReceipt & { email: string };
    const released: string[] = [];
    const flagged: string[] = [];
    const store = {
      listDonations: async () => [], listCharities: async () => [], receiptedDonationIds: async () => new Set<string>(), listDecisions: async () => [],
      donorDetailsFor: async () => [], issue: async () => { throw new Error("not used"); }, listIssuedWithoutPdf: async () => [], savePdf: async () => {},
      listToEmail: async () => [a, b],
      readPdf: async () => Buffer.from("%PDF"),
      claimEmail: async (r: IssuedReceipt) => { if (r.id === "a") throw new Error("A void receipt cannot be changed"); return true; },
      markEmailed: async () => {},
      releaseEmail: async (r: IssuedReceipt) => void released.push(r.id),
    } as unknown as ReceiptStore;
    const sent: string[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = await runReceiptsJob({
      store, taxYear: 2027, today: "2027-03-05", now: new Date(), mode: "finish", charityId: "c1", render: async () => Buffer.from("%PDF"),
      mailer: { transport: { name: "test", send: async (m: { to: string }) => (sent.push(m.to), "sent" as const) }, siteUrl: "https://givezy.test", platformName: "Givezy", onEmailFailed: async (r) => void flagged.push(r.id) },
    });
    err.mockRestore();
    expect(sent).toEqual(["b@x.co"]);
    expect(s).toMatchObject({ emailed: 1, emailFailed: 1 });
    expect(released).toEqual([]);
    expect(flagged).toEqual([]);
  });
});
