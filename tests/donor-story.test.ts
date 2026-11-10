/**
 * A donor's whole story with one charity (CRM step 18): everything newest first in plain words, one label per kind of
 * message, an erased donor shows only gifts, monthly donations and receipts, and the store reads only this charity's
 * rows for this donor (never message bodies or receipt details).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDonorStory, EMPTY_STORY, monthlyStopReason, type StoryRows } from "@/lib/charity/donor-story";

vi.mock("server-only", () => ({}));

const base = "/charity-admin/c1";
const rows = (over: Partial<StoryRows> = {}): StoryRows => ({ ...EMPTY_STORY, ...over });

describe("the donor's story", () => {
  it("merges every kind of entry, newest first, with dates the page shows as dd/mm/yyyy", () => {
    const story = buildDonorStory(
      rows({
        gifts: [
          { id: "d1", status: "paid", amount_cents: 125_000, paid_at: "2026-03-02T08:00:00Z", created_at: "2026-03-02T07:59:00Z", recorded_method: null },
          { id: "d2", status: "refunded", amount_cents: 3_000, paid_at: "2026-05-01T08:00:00Z", created_at: "2026-05-01T08:00:00Z", recorded_method: null },
          { id: "d3", status: "pending", amount_cents: 5_000, paid_at: null, created_at: "2026-06-01T08:00:00Z", recorded_method: null },
        ],
        thanks: [
          { kind: "thank_you", sent_at: "2026-03-03T08:00:00Z" },
          { kind: "s18a_details_reminder", sent_at: "2026-04-03T08:00:00Z" },
          { kind: "journey", sent_at: "2026-04-10T08:00:00Z" },
        ],
        appeals: [{ subject: "Winter soup drive", status: "sent", at: "2026-06-10T08:00:00Z" }],
        monthThanks: [{ period_month: "2026-07-01", status: "failed", at: "2026-08-01T08:00:00Z" }],
        notes: [{ created_at: "2026-02-01T08:00:00Z", author: "Sarah" }],
      }),
      { base, erased: false },
    );
    expect(story.map((e) => [e.what, e.status])).toEqual([
      ["Thank-you for July 2026", "Couldn't be delivered"],
      ["Email to donors: Winter soup drive", "Sent"],
      ["Gift of R30", "Refunded"],
      ["Reminder to add their s18A receipt details", "Sent"],
      ["Your personal thank-you", "Sent"],
      ["Gift of R1 250", null],
      ["Note added by Sarah", null],
    ]);
    expect(story.find((e) => e.what === "Gift of R1 250")?.href).toBe(`${base}/donations/d1`);
    // A pending gift is not part of the story yet, and a journey claim shows once, from the journey's own log.
    expect(story.some((e) => e.what.includes("R50"))).toBe(false);
  });

  it("tells a monthly donation's start, stop and why, in the stopped list's words", () => {
    const story = buildDonorStory(
      rows({
        monthly: [
          { id: "r1", status: "cancelled", amount_cents: 20_000, first_paid_at: "2026-03-01T08:00:00Z", ended_at: "2026-09-01T08:00:00Z", paused_at: null, ended_reason: "cancelled by the donor" },
          { id: "r2", status: "failed", amount_cents: 5_000, first_paid_at: null, ended_at: "2026-09-01T08:00:00Z", paused_at: null, ended_reason: null },
          { id: "r3", status: "paused", amount_cents: 10_000, first_paid_at: "2026-04-01T08:00:00Z", ended_at: null, paused_at: "2026-05-01T08:00:00Z", ended_reason: null },
        ],
      }),
      { base, erased: false },
    );
    expect(story.map((e) => [e.what, e.status])).toEqual([
      ["Monthly donation of R200 stopped", "The donor cancelled it"],
      ["Monthly donation of R100 paused", null],
      ["Monthly donation of R100 started", null],
      ["Monthly donation of R200 started", null],
    ]);
  });

  it("matches the database's reasons for a stopped monthly donation", () => {
    expect(monthlyStopReason("cancelled", "cancelled by the donor")).toBe("cancelled");
    expect(monthlyStopReason("failed", null)).toBe("declined");
    expect(monthlyStopReason("cancelled", "the new card can't be used for monthly payments")).toBe("declined");
    expect(monthlyStopReason("cancelled", "the payment was charged back")).toBe("dispute");
    expect(monthlyStopReason("cancelled", "the donor's information was erased")).toBe("erased");
    expect(monthlyStopReason("cancelled", "something new")).toBe("other");
  });

  it("shows s18A receipts issued, withdrawn and declined, and the donor journey with each email's outcome", () => {
    const story = buildDonorStory(
      rows({
        receipts: [{ receipt_number: 12, tax_year: 2027, amount_cents: 125_000, status: "void", issued_at: "2027-03-05T08:00:00Z", voided_at: "2027-03-06T08:00:00Z", emailed_at: "2027-03-05T09:00:00Z" }],
        declined: [{ tax_year: 2026, decided_at: "2026-03-05T08:00:00Z", decline_emailed_at: null }],
        journey: {
          enrolled_at: "2026-10-01T08:00:00Z",
          status: "stopped",
          stopped_reason: "opted_out",
          sends: [
            { position: 1, status: "sent", at: "2026-10-02T08:00:00Z" },
            { position: 2, status: "unknown", at: "2026-10-20T08:00:00Z" },
          ],
        },
      }),
      { base, erased: false },
    );
    expect(story.map((e) => [e.what, e.status])).toEqual([
      ["s18A receipt 12 withdrawn", null],
      ["s18A receipt 12 for 2026/27 (R1 250)", "Issued and emailed"],
      ["Donor journey email 2", "May not have arrived"],
      ["Left your donor journey", "Because they turned off your emails"],
      ["Donor journey email 1", "Sent"],
      ["Joined your donor journey", null],
      ["s18A receipt for 2025/26 declined", "Not emailed yet"],
    ]);
  });

  it("for a donor who erased their information, shows only gifts, monthly donations and receipts", () => {
    const story = buildDonorStory(
      rows({
        gifts: [{ id: "d1", status: "paid", amount_cents: 1_000, paid_at: "2026-03-02T08:00:00Z", created_at: "2026-03-02T08:00:00Z", recorded_method: null }],
        thanks: [{ kind: "thank_you", sent_at: "2026-03-03T08:00:00Z" }],
        appeals: [{ subject: "Hello", status: "sent", at: "2026-03-04T08:00:00Z" }],
        notes: [{ created_at: "2026-03-05T08:00:00Z", author: "Sarah" }],
        declined: [{ tax_year: 2026, decided_at: "2026-03-05T08:00:00Z", decline_emailed_at: null }],
        journey: { enrolled_at: "2026-03-01T08:00:00Z", status: "active", stopped_reason: null, sends: [] },
      }),
      { base, erased: true },
    );
    expect(story.map((e) => e.what)).toEqual(["Gift of R10"]);
  });

  it("is empty when there is nothing, and drops rows without a usable date", () => {
    expect(buildDonorStory(EMPTY_STORY, { base, erased: false })).toEqual([]);
    expect(buildDonorStory(rows({ appeals: [{ subject: "x", status: "waiting", at: null }] }), { base, erased: false })).toEqual([]);
  });
});

// --- The store: every read names this charity and this donor ----------------------------------------------------

type Call = { table: string; select: string; filters: [string, string, unknown][] };
const calls: Call[] = [];
let answer: Record<string, unknown[]> = {};
let missing = new Set<string>();
/** A column a newer migration adds, missing here: "table:column" fails any select that names it. */
let missingColumns = new Set<string>();

function from(table: string) {
  const call: Call = { table, select: "", filters: [] };
  calls.push(call);
  const q: Record<string, unknown> = {};
  const result = () => {
    if (missing.has(table)) return { data: null, error: { code: "PGRST205", message: "missing" } };
    if ([...missingColumns].some((tc) => tc.startsWith(`${table}:`) && call.select.split(/[ ,]+/).includes(tc.split(":")[1]))) return { data: null, error: { code: "42703", message: "no column" } };
    return { data: answer[table] ?? [], error: null };
  };
  Object.assign(q, {
    select: (s: string) => ((call.select = s), q),
    eq: (c: string, v: unknown) => (call.filters.push([c, "eq", v]), q),
    in: (c: string, v: unknown) => (call.filters.push([c, "in", v]), q),
    order: () => q,
    limit: () => q,
    maybeSingle: async () => {
      const r = result();
      return { data: r.data ? (r.data[0] ?? null) : null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown) => ok(result()),
  });
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

const { loadDonorStory } = await import("@/lib/charity/donor-story-store");
const { emailHash } = await import("@/lib/charity/thank-you");

beforeEach(() => {
  calls.length = 0;
  answer = {};
  missing = new Set();
  missingColumns = new Set();
});

describe("loading a donor's story", () => {
  it("reads only this charity's rows for this donor, and never bodies or receipt details", async () => {
    answer = {
      donations: [
        { id: "d1", status: "paid", amount_cents: "5000", paid_at: "2026-03-02T08:00:00Z", created_at: "2026-03-02T08:00:00Z", recorded_method: null, recurring_id: "r1", donation_checkout_details: { email: "Ann@Example.org ", erased_at: null } },
        { id: "d2", status: "paid", amount_cents: "5000", paid_at: "2026-02-02T08:00:00Z", created_at: "2026-02-02T08:00:00Z", recorded_method: null, recurring_id: "r1", donation_checkout_details: [{ email: "gone@erased.invalid", erased_at: null }] },
        // A failed checkout with someone else's (or a mistyped) address: it must never attribute their thank-you here.
        { id: "d3", status: "failed", amount_cents: "5000", paid_at: null, created_at: "2026-02-03T08:00:00Z", recorded_method: null, recurring_id: null, donation_checkout_details: { email: "stranger@example.org", erased_at: null } },
        { id: "d4", status: "pending", amount_cents: "5000", paid_at: null, created_at: "2026-02-04T08:00:00Z", recorded_method: null, recurring_id: null, donation_checkout_details: { email: "typo@exmaple.org", erased_at: null } },
      ],
      donors: [{ email: "ann.account@example.org" }],
      recurring_donations: [{ id: "r1", status: "active", amount_cents: "5000", paused_at: null, cancelled_at: null, updated_at: "2026-03-02T08:00:00Z", ended_reason: null }],
      charity_thank_yous: [{ id: "t1", period_month: "2026-03-01" }],
      charity_thank_you_recipients: [
        { thank_you_id: "t1", status: "failed", claimed_at: "2026-04-01T08:00:00Z" },
        { thank_you_id: "t1", status: "sent", claimed_at: "2026-04-01T08:01:00Z" },
      ],
    };
    const rowsOut = await loadDonorStory("c1", "dn1", []);
    for (const t of ["donations", "recurring_donations", "charity_donor_thanks", "charity_appeal_recipients", "s18a_receipts", "receipt_plan_decisions", "charity_journey_enrolments"]) {
      const c = calls.find((x) => x.table === t)!;
      expect(c.filters).toEqual(expect.arrayContaining([["charity_id", "eq", "c1"], ["donor_id", "eq", "dn1"]]));
    }
    expect(calls.find((x) => x.table === "charity_thank_yous")!.filters).toEqual([["charity_id", "eq", "c1"]]);
    expect(calls.find((x) => x.table === "charity_thank_you_recipients")!.filters).toEqual([
      ["thank_you_id", "in", ["t1"]],
      ["email_hash", "in", [emailHash("ann.account@example.org"), emailHash("ann@example.org")]],
    ]);
    for (const c of calls) {
      expect(c.select).not.toMatch(/\bbody\b|\bdetails\b|\bnote\b|id_number|tax_number/);
    }
    // The earliest payment starts the monthly donation; one month shows once, with its best outcome.
    expect(rowsOut.monthly[0].first_paid_at).toBe("2026-02-02T08:00:00Z");
    expect(rowsOut.monthThanks).toEqual([{ period_month: "2026-03-01", status: "sent", at: "2026-04-01T08:01:00Z" }]);
    expect(rowsOut.journey).toBeNull();
  });

  it("treats the donor journey as empty where its tables don't exist yet", async () => {
    missing = new Set(["charity_journey_enrolments", "charity_journey_sends"]);
    await expect(loadDonorStory("c1", "dn1", [])).resolves.toMatchObject({ journey: null });
  });

  it("reads the journey's sends for this charity's enrolment only", async () => {
    answer = {
      charity_journey_enrolments: [{ id: "e1", enrolled_at: "2026-10-01T08:00:00Z", status: "active", stopped_reason: null }],
      charity_journey_sends: [{ position: 1, status: "sent", created_at: "2026-10-02T07:00:00Z", sent_at: "2026-10-02T08:00:00Z" }],
    };
    const out = await loadDonorStory("c1", "dn1", []);
    expect(calls.find((x) => x.table === "charity_journey_sends")!.filters).toEqual([["charity_id", "eq", "c1"], ["enrolment_id", "eq", "e1"]]);
    expect(out.journey?.sends).toEqual([{ position: 1, status: "sent", at: "2026-10-02T08:00:00Z" }]);
  });

  it("shows no declined receipts, and reads thank-yous without their kind, where those migrations haven't run yet", async () => {
    missing = new Set(["receipt_plan_decisions"]);
    missingColumns = new Set(["charity_donor_thanks:kind"]);
    answer = { charity_donor_thanks: [{ sent_at: "2026-03-03T08:00:00Z" }] };
    const out = await loadDonorStory("c1", "dn1", []);
    expect(out.declined).toEqual([]);
    expect(out.thanks).toEqual([{ kind: "thank_you", sent_at: "2026-03-03T08:00:00Z" }]);
    const reads = calls.filter((c) => c.table === "charity_donor_thanks");
    expect(reads.map((c) => c.select)).toEqual(["kind, sent_at", "sent_at"]);
    expect(reads[1].filters).toEqual([["charity_id", "eq", "c1"], ["donor_id", "eq", "dn1"]]);
    expect(buildDonorStory(out, { base, erased: false }).map((e) => e.what)).toEqual(["Your personal thank-you"]);
  });

  it("an older project with no weekly-claim table at all still shows the rest", async () => {
    missing = new Set(["charity_donor_thanks"]);
    await expect(loadDonorStory("c1", "dn1", [])).resolves.toMatchObject({ thanks: [] });
  });

  it("stops on any other read error, so the page says it couldn't load rather than showing half a story", async () => {
    missing = new Set(["s18a_receipts"]);
    await expect(loadDonorStory("c1", "dn1", [])).rejects.toBeTruthy();
  });
});
