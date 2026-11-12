/**
 * CRM step 2 (10/11/2026): the Donors list's s18A filter and "Remind to add their details". Filters and counts, who is
 * reminded and who is skipped (erased, opted out, complete, already messaged this week), the one-a-week limit shared
 * with the personal thank-you, and the email's wording.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  S18A_FILTERS,
  inS18aFilter,
  isS18aFilter,
  missingList,
  planReminders,
  reminderOutcome,
  s18aCounts,
  s18aReminderEmail,
  skippedSentence,
  type ReminderCandidate,
} from "@/lib/charity/s18a-reminder";
import { describeDone, describeUndone, pageOf, ASK_FIRST } from "@/lib/charity/done";
import { emailHash } from "@/lib/charity/thank-you";
import type { MissingDetail } from "@/lib/donations/s18a-details";

const missing = new Map<string, MissingDetail[]>([
  ["d1", ["id_number", "address"]],
  ["d3", ["registration_number"]],
]);
const donors = [
  { donor_id: "d1", wants_18a: true },
  { donor_id: "d2", wants_18a: true },
  { donor_id: "d3", wants_18a: true },
  { donor_id: "d4", wants_18a: false },
];

describe("the s18A filter", () => {
  it("has the three filters, named as agreed", () => {
    expect(Object.values(S18A_FILTERS)).toEqual(["Asked for an s18A receipt", "Didn't ask", "Details missing"]);
    expect(isS18aFilter("details_missing")).toBe(true);
    expect(isS18aFilter("toString")).toBe(false);
    expect(isS18aFilter(undefined)).toBe(false);
  });
  it("sorts donors into asked, didn't ask and details missing, with counts", () => {
    expect(donors.filter((d) => inS18aFilter(d, "asked", missing)).map((d) => d.donor_id)).toEqual(["d1", "d2", "d3"]);
    expect(donors.filter((d) => inS18aFilter(d, "not_asked", missing)).map((d) => d.donor_id)).toEqual(["d4"]);
    expect(donors.filter((d) => inS18aFilter(d, "details_missing", missing)).map((d) => d.donor_id)).toEqual(["d1", "d3"]);
    expect(s18aCounts(donors, missing)).toEqual({ asked: 3, not_asked: 1, details_missing: 2 });
    expect(s18aCounts([], missing)).toEqual({ asked: 0, not_asked: 0, details_missing: 0 });
  });
  it("says what is missing in words, never a value", () => {
    expect(missingList(["id_number", "address"])).toBe("SA ID number and address");
    expect(missingList(["registration_number"])).toBe("registration number");
    expect(missingList(["address"])).toBe("address");
  });
});

const cand = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  donorId: "d1", found: true, email: "sarah@x.co", erased: false, missing: ["id_number"], optedOut: false, messagedThisWeek: false, ...over,
});

describe("who gets a reminder", () => {
  it("only donors with details missing, never erased, opted-out, complete or already messaged this week", () => {
    const plan = planReminders([
      cand({ donorId: "send" }),
      cand({ donorId: "gone", erased: true }),
      cand({ donorId: "stop", optedOut: true }),
      cand({ donorId: "done", missing: [] }),
      cand({ donorId: "week", messagedThisWeek: true }),
      cand({ donorId: "rec", email: null }),
      cand({ donorId: "other", found: false }),
    ]);
    expect(plan.send.map((c) => c.donorId)).toEqual(["send"]);
    expect(plan.skipped).toEqual({ not_found: 1, erased: 1, complete: 1, recorded_only: 1, opted_out: 1, this_week: 1 });
  });
  it("says how many were skipped and why, in plain words", () => {
    expect(skippedSentence({ this_week: 2, opted_out: 1 })).toBe(
      "3 weren't sent: 2 already had a message from you this week. They can get one from Monday; 1 turned off emails from you.",
    );
    expect(skippedSentence({})).toBe("");
    expect(reminderOutcome({ sent: 4, failed: 0, remaining: 0, skipped: { complete: 1 } })).toBe(
      "Reminders to add their s18A details went to 4 donors. 1 wasn't sent: 1 has added their details since, so needs no reminder.",
    );
  });
  it("is asked first, can't be taken back, and the record shows on Donors", () => {
    expect(ASK_FIRST).toContain("s18a_reminders_sent");
    expect(pageOf("s18a_reminders_sent")).toBe("donors");
    expect(describeUndone("s18a_reminders_sent", {})).toBe("This can't be taken back.");
    const done = describeDone("s18a_reminders_sent", { sent: 3, failed: 0, remaining: 0, skipped_this_week: 1 }, { base: "/b", publicUrl: null, approved: true });
    expect(done.what).toBe("Reminders to add their s18A details went to 3 donors. 1 wasn't sent: 1 already had a message from you this week. They can get one from Monday.");
    expect(done.next).toEqual({ label: "See who still has details missing", href: "/b/donors?s18a=details_missing" });
  });
});

describe("the reminder email", () => {
  const m = s18aReminderEmail("sarah@x.co", {
    charityName: "Meals Fund",
    firstName: "Sarah",
    missing: ["id_number", "address"],
    detailsUrl: "https://g.test/account#s18a-details",
    stopUrl: "https://g.test/news/stop?t=abc",
    oneClickUrl: "https://g.test/api/stop/news?t=abc",
    replyTo: "office@meals.org",
  });
  it("is in the charity's name, says what is missing and has the link", () => {
    expect(m.subject).toBe("Your s18A receipt from Meals Fund: details still needed");
    expect(m.text).toMatch(/^Dear Sarah,/);
    expect(m.text).toContain("we still need your SA ID number and address");
    expect(m.text).toContain("https://g.test/account#s18a-details");
    expect(m.text).toContain("From Meals Fund");
    expect(m.text).toContain("Reply to this email to reach them.");
    expect(m.text).toContain("To stop emails from Meals Fund: https://g.test/news/stop?t=abc");
    expect(m.replyTo).toBe("office@meals.org");
    expect(m.headers?.["List-Unsubscribe"]).toBe("<https://g.test/api/stop/news?t=abc>");
  });
  it("has no exclamation marks, no guilt and no numbers about the donor", () => {
    expect(`${m.subject}\n${m.text}`).not.toContain("!");
    expect(m.text).not.toMatch(/\bR\d|\b\d{6,}\b/);
    expect(m.text.toLowerCase()).not.toMatch(/urgent|don't miss|last chance|you forgot/);
  });
  it("without a contact email or a first name it still reads well", () => {
    const plain = s18aReminderEmail("a@b.co", { charityName: "Hall Trust", firstName: null, missing: ["address"], detailsUrl: "u", stopUrl: "s", replyTo: null });
    expect(plain.text).toMatch(/^Hello,/);
    expect(plain.text).toContain("we still need your address. SARS asks for this");
    expect(plain.text).toContain("Hall Trust sent this through Givezy.\n");
    expect(plain.replyTo).toBeUndefined();
  });
});

/* ---------------- Sending, against an in-memory database ---------------- */

vi.mock("server-only", () => ({}));
const sent: { to: string; text: string }[] = [];
const audits: { action: string; details?: Record<string, unknown> }[] = [];
let failSend = false;
let dropSend = false;
const { RefusedError, MaybeSentError } = vi.hoisted(() => ({ RefusedError: class RefusedError extends Error {}, MaybeSentError: class EmailMaybeSent extends Error {} }));
/** Claims of the week that go through before the database "goes down" (Infinity: never). */
let claimsBeforeOutage = Infinity;
const records: { kind: string; details: Record<string, unknown> }[] = [];
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async (_c: string, _u: string, kind: string, details: Record<string, unknown>) => (records.push({ kind, details }), `act${records.length}`) }));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: { action: string; details?: Record<string, unknown> }) => void audits.push(e) }));
vi.mock("@/lib/email", () => ({
  EmailError: RefusedError,
  EmailMaybeSent: MaybeSentError,
  getEmailTransport: () => ({
    send: async (m: { to: string; text: string }) => {
      // A refusal from the email service (sure not to have gone), or a dropped connection (may have gone).
      if (failSend) throw new RefusedError("refused");
      if (dropSend) throw new MaybeSentError("fetch failed");
      sent.push(m);
      return "sent";
    },
  }),
}));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let nextId = 1;

/** Just enough of the query builder: eq, neq, in, gte, is, order, limit, range, maybeSingle, single, insert, delete. */
function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const sorts: { col: string; asc: boolean }[] = [];
  let slice: [number, number] | null = null;
  let op: "select" | "delete" = "select";
  const rows = () => {
    let out = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (sorts.length) {
      const by = (a: Row, b: Row) => {
        for (const { col, asc } of sorts) {
          const c = String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0;
          if (c) return c * (asc ? 1 : -1);
        }
        return 0;
      };
      out = [...out].sort(by);
    }
    // Like the real database (max_rows = 1000): never more than 1 000 rows in one answer, without an error.
    return (slice ? out.slice(slice[0], slice[1] + 1) : out).slice(0, 1000);
  };
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (col: string, v: unknown) => (col.includes(".") ? b : (filters.push((r) => r[col] === v), b));
  b.neq = (col: string, v: unknown) => (filters.push((r) => r[col] !== v), b);
  b.in = (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), b);
  b.gte = (col: string, v: string) => (filters.push((r) => new Date(String(r[col])).getTime() >= new Date(v).getTime()), b);
  b.is = (col: string, v: unknown) => (filters.push((r) => (r[col] ?? null) === v), b);
  b.order = (col: string, o?: { ascending?: boolean }) => (sorts.push({ col, asc: o?.ascending !== false }), b);
  b.limit = () => b;
  b.range = (from: number, to: number) => ((slice = [from, to]), b);
  b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
  b.delete = () => ((op = "delete"), b);
  b.insert = (row: Row) => {
    const add = (): { error: { code: string } | null; id?: string } => {
      const list = (tables[table] ??= []);
      if (table === "charity_donor_thanks" && list.some((r) => r.charity_id === row.charity_id && r.donor_id === row.donor_id && r.week_start === row.week_start)) return { error: { code: "23505" } };
      if (table === "charity_donor_thanks" && claimsBeforeOutage-- <= 0) return { error: { code: "08006" } };
      const id = `row${nextId++}`;
      list.push({ id, kind: "thank_you", sent_at: new Date().toISOString(), ...row });
      return { error: null, id };
    };
    return {
      select: () => ({ single: async () => { const r = add(); return r.error ? { data: null, error: r.error } : { data: { id: r.id }, error: null }; } }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: add().error }).then(ok),
    };
  };
  b.then = (ok: (v: unknown) => unknown) => {
    if (op === "delete") {
      const gone = new Set(rows());
      tables[table] = (tables[table] ?? []).filter((r) => !gone.has(r));
      return Promise.resolve({ error: null }).then(ok);
    }
    return Promise.resolve({ data: rows(), error: null }).then(ok);
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));

const { sendS18aReminders, loadS18aMissing, contacts } = await import("@/lib/charity/s18a-reminder-send");
const { sendDonorThankYou } = await import("@/lib/charity/thank-you-send");

const NOW = new Date("2026-11-10T10:00:00+02:00");
const details = (over: Row = {}) => ({
  email: "sarah@x.co", first_name: "Sarah", last_name: "Cohen", donor_type: "individual", organisation_name: null, contact_person: null,
  id_number_encrypted: null, tax_reference_encrypted: null, registration_number: null, address_line1: null, erased_at: null, ...over,
});
const gift = (id: string, donor: string, over: Row = {}, det: Row = {}) => ({
  id, charity_id: "c1", donor_id: donor, status: "paid", wants_18a: true, tax_year: 2027, gateway: "card", paid_at: "2026-10-01T10:00:00+02:00",
  donation_checkout_details: details(det), ...over,
});
const args = (donorIds: string[]) => ({ charityId: "c1", charityName: "Meals Fund", donorIds, userId: "u1", replyTo: "office@meals.org", now: NOW });

beforeEach(() => {
  sent.length = 0;
  audits.length = 0;
  records.length = 0;
  failSend = false;
  dropSend = false;
  claimsBeforeOutage = Infinity;
  nextId = 1;
  process.env.SITE_URL = "https://g.test";
  tables = {
    donations: [
      gift("g1", "sarah"),
      gift("g2", "erased", {}, { email: "erased+1@erased.invalid", erased_at: "2026-10-05" }),
      gift("g3", "stop", {}, { email: "stop@x.co", first_name: "Stop" }),
      gift("g4", "done", {}, { email: "done@x.co", id_number_encrypted: "enc", address_line1: "1 Main Rd" }),
      gift("g5", "noask", { wants_18a: false }, { email: "noask@x.co" }),
      gift("g6", "rec", { gateway: "recorded" }, { email: "rec@x.co" }),
      gift("g7", "other", { charity_id: "c2" }, { email: "other@x.co" }),
    ],
    charity_email_opt_outs: [{ charity_id: "c1", email_hash: emailHash("stop@x.co") }],
    s18a_receipt_donations: [],
    thank_you_opt_outs: [],
  };
});

describe("finding donors with details missing", () => {
  it("lists only this charity's donors whose gifts lack what SARS needs, with what is missing", async () => {
    const m = await loadS18aMissing("c1", NOW);
    expect([...m.keys()].sort()).toEqual(["rec", "sarah", "stop"]);
    expect(m.get("sarah")).toEqual(["id_number", "address"]);
  });
});

describe("sending reminders", () => {
  it("emails only donors with details missing, skipping erased, opted-out, complete and recorded-only donors and other charities' donors", async () => {
    const r = await sendS18aReminders(args(["sarah", "erased", "stop", "done", "noask", "rec", "other"]));
    expect(sent.map((m) => m.to)).toEqual(["sarah@x.co"]);
    expect(sent[0].text).toContain("https://g.test/account#s18a-details");
    expect(sent[0].text).toMatch(/https:\/\/g\.test\/news\/stop\?t=[A-Za-z0-9_-]{43}/);
    expect(r).toEqual({ sent: 1, failed: 0, unknown: 0, remaining: 0, skipped: { not_found: 1, erased: 1, complete: 2, recorded_only: 1, opted_out: 1, this_week: 0 }, interrupted: false, done: "act1" });
    // The dashboard's "what just happened", written by the sender itself.
    expect(records).toEqual([{ kind: "s18a_reminders_sent", details: { sent: 1, failed: 0, remaining: 0, skipped_not_found: 1, skipped_erased: 1, skipped_complete: 2, skipped_recorded_only: 1, skipped_opted_out: 1, skipped_this_week: 0 } }]);
    // Counts only in the audit log: no names, addresses or numbers.
    expect(audits).toEqual([{ action: "charity.s18a_reminders_sent", actorUserId: "u1", entityType: "charity", entityId: "c1", details: { chosen: 7, sent: 1, failed: 0, remaining: 0, not_found: 1, erased: 1, complete: 2, recorded_only: 1, opted_out: 1, this_week: 0 } }]);
  });

  it("one message a week: a reminder after a thank-you is skipped, and a thank-you after a reminder is refused", async () => {
    expect((await sendDonorThankYou({ charityId: "c1", charityName: "Meals Fund", donorId: "sarah", body: "Thank you, truly.", userId: "u1", replyTo: null })).ok).toBe(true);
    const r = await sendS18aReminders(args(["sarah"]));
    expect(r.sent).toBe(0);
    expect(r.skipped.this_week).toBe(1);
    expect(sent).toHaveLength(1);

    // A new week, the other way round.
    tables.charity_donor_thanks = [];
    sent.length = 0;
    expect((await sendS18aReminders(args(["sarah"]))).sent).toBe(1);
    const thanks = await sendDonorThankYou({ charityId: "c1", charityName: "Meals Fund", donorId: "sarah", body: "Thank you, truly.", userId: "u1", replyTo: null });
    expect(thanks.ok === false && thanks.message).toMatch(/already had a message from you this week/);
    expect(sent).toHaveLength(1);
    // Pressing again the same week sends nothing more.
    expect((await sendS18aReminders(args(["sarah"]))).skipped.this_week).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("a news email or appeal sent this week counts too", async () => {
    tables.charity_appeal_recipients = [{ charity_id: "c1", donor_id: "sarah", status: "sent", claimed_at: "2026-11-09T09:00:00+02:00" }];
    expect((await sendS18aReminders(args(["sarah"]))).skipped.this_week).toBe(1);
    // Last week's doesn't.
    tables.charity_appeal_recipients = [{ charity_id: "c1", donor_id: "sarah", status: "sent", claimed_at: "2026-11-08T23:00:00+02:00" }];
    expect((await sendS18aReminders(args(["sarah"]))).sent).toBe(1);
  });

  it("a send the email service refused hands the week back, so the donor can be reminded later", async () => {
    failSend = true;
    const r = await sendS18aReminders(args(["sarah"]));
    expect(r).toMatchObject({ sent: 0, failed: 1, unknown: 0 });
    expect(tables.charity_donor_thanks ?? []).toHaveLength(0);
  });

  it("a dropped connection may have sent it: the week stays claimed, it isn't counted as failed, and the words say so", async () => {
    dropSend = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendS18aReminders(args(["sarah"]));
    err.mockRestore();
    expect(r).toMatchObject({ sent: 0, failed: 0, unknown: 1, done: "act1" });
    expect(tables.charity_donor_thanks).toHaveLength(1);
    expect(records[0].details).toMatchObject({ unknown: 1 });
    // Pressing again the same week never sends it a second time.
    dropSend = false;
    expect((await sendS18aReminders(args(["sarah"]))).skipped.this_week).toBe(1);
    expect(sent).toHaveLength(0);
    expect(reminderOutcome({ sent: 0, failed: 0, unknown: 1, remaining: 0, skipped: {} })).toBe(
      "The connection dropped while sending 1 reminder, so it may or may not have gone. To be safe, it isn't sent again this week, so nobody gets two.",
    );
  });

  it("finds every donor's latest gift even past the 1 000 rows one read returns", async () => {
    // A long-standing donor with 1 500 paid gifts read in the same batch as Sarah: without paging, Sarah's gift could
    // fall off the end and she'd look like someone with no paid gift.
    for (let i = 0; i < 1500; i++) tables.donations.push(gift(`old${String(i).padStart(4, "0")}`, "loyal", { wants_18a: false, paid_at: "2026-11-01T10:00:00+02:00" }, { email: "loyal@x.co" }));
    const who = await contacts("c1", ["loyal", "sarah"]);
    expect([...who.found].sort()).toEqual(["loyal", "sarah"]);
    expect(who.byDonor.get("sarah")?.email).toBe("sarah@x.co");
  });

  it("a donor's address and greeting come from their latest gift", async () => {
    tables.donations.push(gift("g0", "sarah", { paid_at: "2026-11-05T10:00:00+02:00" }, { email: "sarah.new@x.co", first_name: "Sal" }));
    const who = await contacts("c1", ["sarah"]);
    expect(who.byDonor.get("sarah")).toEqual({ email: "sarah.new@x.co", greeting: "Sal" });
  });

  it("stopped part way by a database problem: what was sent is still recorded, and the rest are still to send", async () => {
    tables.donations.push(gift("g8", "anna", {}, { email: "anna@x.co", first_name: "Anna" }), gift("g9", "ben", {}, { email: "ben@x.co", first_name: "Ben" }));
    claimsBeforeOutage = 1;
    const r = await sendS18aReminders(args(["sarah", "anna", "ben"]));
    expect(sent).toHaveLength(1);
    expect(r).toMatchObject({ sent: 1, failed: 0, remaining: 2, interrupted: true, done: "act1" });
    expect(audits[0].details).toMatchObject({ chosen: 3, sent: 1, failed: 0, remaining: 2, interrupted: true });
    expect(records[0].details).toMatchObject({ sent: 1, remaining: 2, interrupted: true });
  });

  it("nothing tried: no dashboard record, but the audit entry is still written", async () => {
    const r = await sendS18aReminders(args(["stop"]));
    expect(r).toMatchObject({ sent: 0, failed: 0, remaining: 0, done: null });
    expect(records).toEqual([]);
    expect(audits).toHaveLength(1);
  });

  it("a monthly thank-you this week counts too", async () => {
    tables.charity_thank_yous = [{ id: "t1", charity_id: "c1", sent_at: "2026-11-09T09:00:00+02:00" }];
    tables.charity_thank_you_recipients = [{ thank_you_id: "t1", email_hash: emailHash("sarah@x.co"), status: "sent", claimed_at: "2026-11-09T09:00:00+02:00" }];
    expect((await sendS18aReminders(args(["sarah"]))).skipped.this_week).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("a personal thank-you is refused after a news email this week, in the same plain words", async () => {
    tables.charity_appeal_recipients = [{ charity_id: "c1", appeal_id: "a1", donor_id: "sarah", status: "sent", claimed_at: "2026-11-09T09:00:00+02:00" }];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const thanks = await sendDonorThankYou({ charityId: "c1", charityName: "Meals Fund", donorId: "sarah", body: "Thank you, truly.", userId: "u1", replyTo: null });
    expect(thanks.ok === false && thanks.message).toBe(
      "⁨Sarah Cohen⁩ already had a message from you this week, so nothing was sent. Givezy sends each donor at most one message a week from your charity. You can thank them from Monday.",
    );
    vi.useRealTimers();
    expect(sent).toHaveLength(0);
    expect(tables.charity_donor_thanks ?? []).toHaveLength(0);
  });

  it("a gift already on an issued s18A receipt isn't asked about", async () => {
    tables.s18a_receipt_donations = [{ donation_id: "g1" }];
    expect((await sendS18aReminders(args(["sarah"]))).skipped.complete).toBe(1);
    expect(sent).toHaveLength(0);
  });
});
