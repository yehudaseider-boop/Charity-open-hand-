/**
 * Review 23/11/2026, the receipt runs: a sign-off or Finish stops cleanly before the request's time limit and carries on
 * with the approved remainder when Finish is pressed again; each receipt is emailed right after it is issued; a stale email
 * claim is flagged for a person, never resent; a receipt email marked "unknown" can be settled by an admin; and Finish
 * checks the result of its final save. The database, Chrome and the email service are stand-ins.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailMessage } from "@/lib/email";
import type { CharityRow, DonorRow } from "@/lib/receipts/details";
import { runReceiptsJob, remainingText, TIME_SPARE_MS, type IssuedReceipt, type JobSummary, type ReceiptStore } from "@/lib/receipts/issue";
import type { PlanCharity, PlanDonation } from "@/lib/receipts/plan";
import { planReceipts } from "@/lib/receipts/plan";
import { certificateFingerprint, type StoredDecision } from "@/lib/receipts/review";
import { supabaseReceiptStore } from "@/lib/receipts/store";

vi.mock("server-only", () => ({}));

const charity: PlanCharity & CharityRow = {
  id: "c1", isS18a: true, mandateSignedAt: "2026-03-09T00:00:00+02:00", s18aPeriods: [{ startedAt: "2026-03-09T00:00:00+02:00", endedAt: null }], quickgive_code: "LTC",
  legal_name_en: "Linksfield Learning Centre NPC", npo_number: "123-456 NPO", pbo_number: "930012345", s18a_reference: "18A/2026/1",
  address_line1: "1 Test Road", address_line2: null, suburb: "Linksfield", city: "Johannesburg", postal_code: "2192",
} as PlanCharity & CharityRow;
const donor: DonorRow = {
  donor_type: "individual", first_name: "Sarah", last_name: "Levin", organisation_name: null, registration_number: null,
  address_line1: "5 Test Road", address_line2: null, suburb: null, city: "Johannesburg", postal_code: "2192", id_number_last4: "9085", tax_reference_last4: null,
};
const don = (id: string): PlanDonation => ({ id, charityId: "c1", donorId: `u-${id}`, donorIdentity: "", taxYear: 2027, amountCents: 50_000, status: "paid", wants18a: true, paidAt: "2026-10-01T10:00:00Z" });

describe("a run that runs out of time", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  function setup() {
    const donations = ids.map(don);
    const issued: IssuedReceipt[] = [];
    const events: string[] = [];
    const receipted = new Set<string>();
    const decisions = async (taxYear: number): Promise<StoredDecision[]> =>
      planReceipts({ taxYear, donations, charities: [charity], alreadyReceipted: new Set() }).receipts.map((r, i) => ({
        id: `dec${i}`, charityId: r.charityId, taxYear, donorId: r.donorId, donorIdentity: r.donorIdentity, decision: "approved" as const,
        certificateFingerprint: certificateFingerprint(r), decidedAt: "2027-03-02T08:00:00Z",
      }));
    let t = 0;
    const store: ReceiptStore = {
      listDonations: async () => donations,
      listCharities: async () => [charity],
      receiptedDonationIds: async () => receipted,
      listDecisions: async (y) => decisions(y),
      donorDetailsFor: async (dids) => dids.map((id) => ({ id, paidAt: "2026-10-01T10:00:00Z", amountCents: 50_000, recordedMethod: null, donor })),
      issue: async (r, c, details) => {
        // Each receipt takes ten seconds in all.
        t += 10_000;
        r.donationIds.forEach((id) => receipted.add(id));
        const receipt = { id: `r${issued.length + 1}`, reference: `${c.quickgive_code}-2027-000${issued.length + 1}`, charityId: r.charityId, details, pdfPath: null };
        issued.push(receipt);
        events.push(`issue ${receipt.id}`);
        return receipt;
      },
      listIssuedWithoutPdf: async () => [],
      savePdf: async (r) => void events.push(`pdf ${r.id}`),
      listToEmail: async (_y, _c, only) => issued.filter((r) => !only || r.id === only).map((r) => ({ ...r, pdfPath: "x.pdf", email: `${r.id}@example.co.za` })).filter((r) => !events.includes(`email ${r.id}`)),
      readPdf: async () => Buffer.from("%PDF"),
      claimEmail: async () => true,
      markEmailed: async (r) => void events.push(`email ${r.id}`),
      releaseEmail: async () => {},
    };
    return { store, events, clock: () => t };
  }
  const base = { taxYear: 2027, today: "2027-03-10", now: new Date("2027-03-10T08:00:00Z"), mode: "issue" as const, render: async () => Buffer.from("%PDF") };
  const mailer = { transport: { name: "test", send: async (_m: EmailMessage) => "sent" as const }, siteUrl: "https://example.co.za", platformName: "Givezy" };

  it("stops with TIME_SPARE_MS to spare, says how many are left, and emails each receipt right after it is issued", async () => {
    const { store, events, clock } = setup();
    const s = await runReceiptsJob({ store, ...base, mailer, deadline: 60_000, clock, fingerprint: (r) => `left:${r.length}` });
    expect(TIME_SPARE_MS).toBe(15_000);
    // Receipts start while the clock is at or before 45 s: five of the six.
    expect(s).toMatchObject({ issued: 5, pdfsMade: 5, emailed: 5, remaining: 1, stoppedForTime: true });
    // The record of the list as it stood: the sixth, still approved and unissued.
    expect(s.remainingFingerprint).toBe("left:1");
    // Each one is emailed before the next is issued, so a run cut off later still leaves what it got to emailed.
    expect(events.slice(0, 6)).toEqual(["issue r1", "pdf r1", "email r1", "issue r2", "pdf r2", "email r2"]);
    expect(remainingText(s)).toMatch(/^1 approved receipt is still to issue.*Press Finish again/);
  });

  it("does nothing special without a deadline (the script that issues everything on a machine)", async () => {
    const { store } = setup();
    const s = await runReceiptsJob({ store, ...base, mailer });
    expect(s).toMatchObject({ issued: 6, emailed: 6 });
    expect(s.remaining).toBeUndefined();
    expect(remainingText(s)).toBe("");
  });
});

// ---- the run (runs.ts) with a stand-in database ----

type Op = { table: string; op: string; patch?: Record<string, unknown>; filters: Record<string, unknown> };
function makeDb(answer: (op: Op) => { data?: unknown; error?: { message: string; code?: string } | null; count?: number }) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const o: Op = { table, op: "select", filters: {} };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "range", "limit", "not", "is", "lt", "gte", "in", "or"]) b[m] = () => b;
    b.eq = (c: string, v: unknown) => ((o.filters[c] = v), b);
    for (const m of ["update", "upsert", "delete", "insert"]) b[m] = (p?: Record<string, unknown>) => ((o.op = m), (o.patch = p), b);
    const run = () => (ops.push(o), Promise.resolve(answer(o)).then((r) => ({ data: null, error: null, ...r })));
    b.maybeSingle = run;
    b.single = run;
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej);
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, ops };
}

describe("a Finish that carries on, and one that fails to save", () => {
  const summaryOf = (o: Partial<JobSummary>): JobSummary => ({ taxYear: 2027, mode: "issue", planned: 6, issued: 5, pdfsMade: 5, emailed: 5, emailFailed: 0, skippedByReason: {}, needsAttention: [], checkIdentities: [], failed: [], ...o });

  async function load(opts: { run: Record<string, unknown>; failSave?: boolean; job: (a: Parameters<typeof runReceiptsJob>[0]) => Promise<JobSummary> }) {
    vi.resetModules();
    const { db, ops } = makeDb((op) => {
      if (op.table === "receipt_runs" && op.op === "select") return { data: opts.run };
      if (op.table === "receipt_runs" && op.op === "update") return opts.failSave ? { error: { message: "connection lost" } } : { data: [{ id: "run1" }] };
      return {};
    });
    const jobCalls: Parameters<typeof runReceiptsJob>[0][] = [];
    vi.doMock("@/lib/audit", () => ({ logAudit: async () => {} }));
    vi.doMock("@/config/receipts", async (orig) => ({ ...(await orig<object>()), receiptsEnabled: () => true }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
    vi.doMock("@/lib/receipts/store", () => ({ supabaseReceiptStore: () => ({}) }));
    vi.doMock("@/lib/receipts/issue", async (orig) => ({
      ...(await orig<object>()),
      runReceiptsJob: async (a: Parameters<typeof runReceiptsJob>[0]) => (jobCalls.push(a), opts.job(a)),
    }));
    const runs = await import("@/lib/receipts/runs");
    return { runs, ops, jobCalls };
  }
  const run = (summary: JobSummary) => ({ id: "run1", charity_id: "c1", tax_year: 2027, status: "done", plan_fingerprint: "f", receipts_planned: 6, total_cents: 300_000, summary });

  it("carries on issuing the approved remainder, in issue mode, after checking it is still the list that was left", async () => {
    const before = summaryOf({ remaining: 1, remainingFingerprint: "left-list", stoppedForTime: true });
    const { runs, jobCalls, ops } = await load({ run: run(before), job: async () => summaryOf({ mode: "issue", planned: 1, issued: 1, pdfsMade: 1, emailed: 1 }) });
    const r = await runs.finishRun({ runId: "run1", userId: "admin1" });
    expect(jobCalls[0].mode).toBe("issue");
    expect(jobCalls[0].deadline).toBeGreaterThan(Date.now());
    expect(() => jobCalls[0].checkPlan!([])).toThrow();
    expect(r).toMatchObject({ ok: true, summary: { issued: 6, pdfsMade: 6, emailed: 6, remaining: 0 } });
    expect(ops.some((o) => o.table === "receipt_runs" && o.op === "update")).toBe(true);
  });

  it("refuses, and issues nothing more, when the list changed since the run stopped", async () => {
    const before = summaryOf({ remaining: 1, remainingFingerprint: "left-list", stoppedForTime: true });
    const { runs, ops } = await load({
      run: run(before),
      job: async (a) => {
        // The list now differs from the one saved when the run stopped.
        a.checkPlan!([]);
        return summaryOf({});
      },
    });
    const r = await runs.finishRun({ runId: "run1", userId: "admin1" });
    expect(r).toEqual({ ok: false, why: "changed" });
    const saved = ops.find((o) => o.table === "receipt_runs" && o.op === "update")!.patch!.summary as JobSummary;
    expect(saved.remaining).toBe(0);
    expect(saved.failed[0].message).toMatch(/list changed/);
  });

  it("an older run with nothing left to issue only finishes PDFs and emails, as before", async () => {
    const { runs, jobCalls } = await load({ run: run(summaryOf({ emailed: 3 })), job: async () => summaryOf({ mode: "finish", issued: 0, pdfsMade: 0, emailed: 2 }) });
    await runs.finishRun({ runId: "run1", userId: "admin1" });
    expect(jobCalls[0].mode).toBe("finish");
    expect(jobCalls[0].checkPlan).toBeUndefined();
  });

  it("says plainly when its final summary could not be saved, instead of ignoring it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { runs } = await load({ run: run(summaryOf({ emailed: 3 })), failSave: true, job: async () => summaryOf({ mode: "finish", issued: 0, pdfsMade: 0, emailed: 2 }) });
    const r = await runs.finishRun({ runId: "run1", userId: "admin1" });
    expect(r).toMatchObject({ ok: false, why: "error", message: expect.stringMatching(/could not be saved.*press Finish once more/s) });
    expect(err).toHaveBeenCalledWith("[receipts] could not save what Finish did", "run1", "connection lost");
    err.mockRestore();
  });
});

describe("a stale email claim", () => {
  const receipt = { id: "r1", charityId: "c1", reference: "LTC-2027-0001", details: {}, pdfPath: "c1/r1.pdf" } as unknown as IssuedReceipt;

  it("is flagged as maybe sent for a person and never taken over to send again", async () => {
    const { db, ops } = makeDb((op) => {
      if (op.table === "email_retries" && op.op === "select") return { data: [] };
      // The fresh claim finds a claim already there; the stale check finds it older than 15 minutes.
      if (op.table === "s18a_receipts" && op.op === "update") return { data: [] };
      if (op.table === "s18a_receipts" && op.op === "select") return { data: [{ id: "r1" }] };
      return {};
    });
    expect(await supabaseReceiptStore(db).claimEmail(receipt)).toBe(false);
    const flag = ops.find((o) => o.table === "email_retries" && o.op === "upsert")!;
    expect(flag.patch).toMatchObject({ kind: "s18a_receipt", ref_id: "r1", status: "unknown" });
    // The only write to the receipt is the fresh claim, which needs the claim to be empty: no take-over of an old one.
    const writes = ops.filter((o) => o.table === "s18a_receipts" && o.op === "update");
    expect(writes).toHaveLength(1);
  });

  it("a receipt that simply has a fresh claim by another run is not flagged", async () => {
    const { db, ops } = makeDb((op) => (op.table === "email_retries" ? { data: [] } : { data: [] }));
    expect(await supabaseReceiptStore(db).claimEmail(receipt)).toBe(false);
    expect(ops.some((o) => o.op === "upsert")).toBe(false);
  });
});

describe("settling a receipt email marked unknown", () => {
  async function load(flagged: boolean, receiptOpen = true) {
    vi.resetModules();
    const audits: { action: string; entityId?: string | null }[] = [];
    const { db, ops } = makeDb((op) => {
      if (op.table === "email_retries" && op.op === "select") return { data: flagged ? { id: "flag1" } : null };
      if (op.table === "s18a_receipts" && op.op === "update") return { data: receiptOpen ? [{ id: "r1" }] : [] };
      return {};
    });
    vi.doMock("@/lib/audit", () => ({ logAudit: async (a: { action: string; entityId?: string | null }) => void audits.push(a) }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
    return { runs: await import("@/lib/receipts/runs"), ops, audits };
  }

  it("It arrived: marks the receipt emailed, closes the flag, and is audited", async () => {
    const { runs, ops, audits } = await load(true);
    expect(await runs.markReceiptEmailArrived({ receiptId: "r1", userId: "admin1" })).toEqual({ ok: true });
    expect(ops.find((o) => o.table === "s18a_receipts" && o.op === "update")!.patch).toMatchObject({ email_claimed_at: null, emailed_at: expect.any(String) });
    expect(ops.find((o) => o.table === "email_retries" && o.op === "update")!.patch).toMatchObject({ status: "sent" });
    expect(audits).toEqual([{ actorUserId: "admin1", action: "receipt.email_confirmed_arrived", entityType: "s18a_receipt", entityId: "r1", details: {} }]);
  });

  it("Send again: clears the claim and deletes the unknown row, and is audited", async () => {
    const { runs, ops, audits } = await load(true);
    expect(await runs.allowReceiptEmailAgain({ receiptId: "r1", userId: "admin1" })).toEqual({ ok: true });
    expect(ops.find((o) => o.table === "s18a_receipts" && o.op === "update")!.patch).toEqual({ email_claimed_at: null });
    expect(ops.some((o) => o.table === "email_retries" && o.op === "delete")).toBe(true);
    expect(audits.map((a) => a.action)).toEqual(["receipt.email_send_again_allowed"]);
  });

  it("does nothing for a receipt that was never flagged, or is no longer open", async () => {
    const a = await load(false);
    expect(await a.runs.markReceiptEmailArrived({ receiptId: "r1", userId: "admin1" })).toEqual({ ok: false, why: "not_flagged" });
    expect(await a.runs.allowReceiptEmailAgain({ receiptId: "r1", userId: "admin1" })).toEqual({ ok: false, why: "not_flagged" });
    expect(a.ops.some((o) => o.op !== "select")).toBe(false);
    const b = await load(true, false);
    expect(await b.runs.markReceiptEmailArrived({ receiptId: "r1", userId: "admin1" })).toEqual({ ok: false, why: "gone" });
    expect(b.audits).toEqual([]);
  });

  it("the actions are for a platform admin with the second step only", async () => {
    vi.resetModules();
    const settled = vi.fn();
    vi.doMock("@/lib/auth", () => ({ requirePlatformAdmin: async () => { throw new Error("redirect to sign in"); } }));
    vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
    vi.doMock("next/navigation", () => ({ redirect: () => {} }));
    vi.doMock("@/lib/audit", () => ({ logAudit: async () => {} }));
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
    vi.doMock("@/lib/receipts/runs", async (orig) => ({ ...(await orig<object>()), markReceiptEmailArrived: settled, allowReceiptEmailAgain: settled }));
    const actions = await import("@/app/admin/receipts/actions");
    const id = "11111111-1111-1111-1111-111111111111";
    await expect(actions.receiptEmailArrived(id, { ok: false }, new FormData())).rejects.toThrow("redirect");
    await expect(actions.receiptEmailSendAgain(id, { ok: false }, new FormData())).rejects.toThrow("redirect");
    expect(settled).not.toHaveBeenCalled();
  });
});

describe("one Chrome for a whole run", () => {
  it("launches once for many receipts and closes at the end", async () => {
    vi.resetModules();
    const launches: string[] = [];
    let closed = 0;
    const page = { route: async () => {}, setContent: async () => {}, pdf: async () => Buffer.from("%PDF"), close: async () => {} };
    vi.doMock("playwright-core", () => ({ chromium: { launch: async () => (launches.push("launch"), { newPage: async () => page, close: async () => void closed++ }) } }));
    process.env.CHROME_PATH = "/usr/bin/chromium";
    const { pdfPrinter } = await import("@/lib/receipts/pdf");
    const printer = pdfPrinter();
    for (let i = 0; i < 4; i++) await printer.toPdf("<p>x</p>");
    expect(launches).toHaveLength(1);
    await printer.close();
    expect(closed).toBe(1);
    delete process.env.CHROME_PATH;
  });
});
