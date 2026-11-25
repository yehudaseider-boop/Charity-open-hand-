/**
 * Deleting your own account in the app (25/11/2026): who is refused, what is stopped first, what is never touched.
 * The database, the audit log and the erasure itself are stand-ins; the erasure's own steps are tested in
 * erase-donor-flow.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const USER = "22222222-2222-2222-2222-222222222222";
const EMAIL = "sam@example.co.za";

type Write = { table: string; op: "update" | "delete"; patch?: Record<string, unknown> };
const writes: Write[] = [];
const order: string[] = [];
const audits: { action: string; actorUserId: string | null; details?: Record<string, unknown> }[] = [];

let role: string;
let adminCount: number;
let openRequests: number;
let donorIds: string[];
let inFlight: number;
let recurringLeft: number;
let cardLeft: number;
/** Table.op that fails with a database error. */
let failing: Set<string>;
/** The cancel "succeeds" but rows are still live when read back. */
let cancelDoesNothing: boolean;
let auditFails: boolean;
let eraseResult: { accountDeleted: boolean } | Error;
const eraseCalls: Record<string, unknown>[] = [];

vi.mock("@/lib/audit", () => ({
  logAudit: async (e: { action: string; actorUserId: string | null; details?: Record<string, unknown> }) => {
    if (auditFails) throw new Error("audit down");
    order.push(`audit:${e.action}`);
    audits.push(e);
  },
}));
vi.mock("@/lib/privacy/erase", () => ({
  eraseDonor: async (args: Record<string, unknown>) => {
    order.push("erase");
    eraseCalls.push(args);
    if (eraseResult instanceof Error) throw eraseResult;
    return { donors: 1, checkout_details: 0, monthly_stopped: 1, giving_choices: 0, messages: 0, gateway_records: 0, ...eraseResult };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const st: { op: "select" | "update" | "delete"; head: boolean; patch?: Record<string, unknown> } = { op: "select", head: false };
      const exec = () => {
        const key = `${table}.${st.op}`;
        if (st.op !== "select") {
          order.push(key);
          writes.push({ table, op: st.op, patch: st.patch });
        }
        if (failing.has(key) || (st.op === "select" && failing.has(`${table}.select`))) return { data: null, count: null, error: { message: `${key} failed` } };
        if (st.op === "update" && table === "recurring_donations" && !cancelDoesNothing) recurringLeft = 0;
        if (st.op === "delete" && table === "saved_cards") cardLeft = 0;
        if (st.op !== "select") return { data: null, count: null, error: null };
        switch (table) {
          case "charity_admins":
            return { count: adminCount, data: null, error: null };
          case "data_requests":
            return { count: openRequests, data: null, error: null };
          case "donations":
            return { count: inFlight, data: null, error: null };
          case "recurring_donations":
            return { count: recurringLeft, data: null, error: null };
          case "saved_cards":
            return { count: cardLeft, data: null, error: null };
          case "donors":
            return { data: donorIds.map((id) => ({ id })), count: null, error: null };
          default:
            return { data: null, count: 0, error: null };
        }
      };
      const api: Record<string, unknown> = {
        select: (_c?: string, o?: { head?: boolean }) => ((st.head = Boolean(o?.head)), api),
        update: (patch: Record<string, unknown>) => ((st.op = "update"), (st.patch = patch), api),
        delete: () => ((st.op = "delete"), api),
        eq: () => api,
        in: () => api,
        not: () => api,
        gte: () => api,
        or: () => api,
        maybeSingle: async () => ({ data: table === "profiles" ? { role } : null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(exec()).then(resolve, reject),
      };
      return api;
    },
  }),
}));

const { deleteOwnAccount, deletePreflight, stopAllCharging, whyNotDeletable } = await import("@/lib/privacy/self-delete");

const NOW = Date.UTC(2026, 10, 25, 10, 0, 0);
const fresh = Math.floor((NOW - 2 * 60_000) / 1000);
const stale = Math.floor((NOW - 2 * 60 * 60_000) / 1000);
const me = (signedInAt: number | null = fresh) => ({ userId: USER, email: EMAIL, signedInAt });

/** The only tables the deletion may write to before the erasure: what could charge them. */
const MAY_WRITE = new Set(["recurring_donations", "saved_cards", "card_save_requests"]);

beforeEach(() => {
  writes.length = 0;
  order.length = 0;
  audits.length = 0;
  eraseCalls.length = 0;
  role = "user";
  adminCount = 0;
  openRequests = 0;
  donorIds = ["d1"];
  inFlight = 0;
  recurringLeft = 1;
  cardLeft = 1;
  failing = new Set();
  cancelDoesNothing = false;
  auditFails = false;
  eraseResult = { accountDeleted: true };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

/** Nothing was deleted, stopped or sent: no write at all except audit rows, and no erasure. */
function expectNothingTouched() {
  expect(writes).toEqual([]);
  expect(eraseCalls).toEqual([]);
  expect(order).not.toContain("erase");
}

describe("who is refused, with nothing touched", () => {
  it("someone who manages a charity: hand it over first", async () => {
    adminCount = 1;
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, code: "manager" });
    expect((r.body as { message: string }).message).toMatch(/hand it over/i);
    expectNothingTouched();
  });

  it("a Givezy platform admin", async () => {
    role = "platform_admin";
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.body).toMatchObject({ ok: false, code: "platform_admin" });
    expectNothingTouched();
  });

  it("someone with an open privacy request in progress", async () => {
    openRequests = 1;
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, code: "request_open" });
    expectNothingTouched();
  });

  it("the app reviewer's sign-in, also when the fixed code is not switched on, and in any letter case", async () => {
    vi.stubEnv("REVIEW_SIGN_IN_EMAIL", "  Sam@Example.co.za ");
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.body).toMatchObject({ ok: false, code: "reviewer" });
    expectNothingTouched();
    // And before the typed confirmation or a recent sign-in are even looked at.
    const old = await deleteOwnAccount(me(stale), "nope", NOW);
    expect(old.body).toMatchObject({ code: "reviewer" });
  });

  it("someone whose monthly charge started in the last half hour: wait, so they are never charged after deleting", async () => {
    inFlight = 1;
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.body).toMatchObject({ ok: false, code: "payment_in_progress" });
    expectNothingTouched();
  });

  it("when the account cannot be checked, nothing is deleted and the answer says so", async () => {
    failing.add("charity_admins.select");
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "unavailable" });
    expect((r.body as { message: string }).message).toMatch(/nothing was deleted/i);
    expectNothingTouched();
  });

  it("every refusal is written to the audit log with a reason only", async () => {
    adminCount = 1;
    await deleteOwnAccount(me(), "DELETE", NOW);
    expect(audits).toEqual([{ action: "privacy.account_delete_refused", actorUserId: USER, entityType: "user", entityId: USER, details: { reason: "manager" } }]);
  });
});

describe("a recent sign-in and the typed confirmation", () => {
  it("refuses a sign-in older than ten minutes, with the plain 'sign in again' answer", async () => {
    const r = await deleteOwnAccount(me(stale), "DELETE", NOW);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, code: "sign_in_again" });
    expectNothingTouched();
  });

  it("refuses a token that gives no sign-in time", async () => {
    const r = await deleteOwnAccount(me(null), "DELETE", NOW);
    expect(r.body).toMatchObject({ code: "sign_in_again" });
    expectNothingTouched();
  });

  it("refuses without the typed confirmation", async () => {
    for (const typed of [undefined, "", "yes", "DELET", 7]) {
      const r = await deleteOwnAccount(me(), typed, NOW);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "confirm" });
    }
    expectNothingTouched();
  });

  it("accepts DELETE or their own email address", async () => {
    expect((await deleteOwnAccount(me(), "delete", NOW)).status).toBe(200);
    expect((await deleteOwnAccount(me(), "SAM@example.co.za", NOW)).status).toBe(200);
  });

  it("the screen's check says whether to sign in again first, and changes nothing", async () => {
    const recent = await deletePreflight(me(), NOW);
    expect(recent).toMatchObject({ status: 200, body: { ok: true, signInAgain: false } });
    const old = await deletePreflight(me(stale), NOW);
    expect(old).toMatchObject({ status: 200, body: { ok: true, signInAgain: true } });
    adminCount = 1;
    expect(await deletePreflight(me(), NOW)).toMatchObject({ status: 409, body: { code: "manager" } });
    expect(writes).toEqual([]);
    expect(audits).toEqual([]);
  });
});

describe("the work, in order", () => {
  it("records that it started, stops the charging, checks, then erases (which emails after its work and deletes the account last)", async () => {
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true });
    expect(order).toEqual([
      "audit:privacy.account_delete_started",
      "recurring_donations.update",
      "saved_cards.delete",
      "card_save_requests.delete",
      "erase",
    ]);
  });

  it("hands the erasure the person's account only, with the in-app audit action and the draft confirmation email", async () => {
    await deleteOwnAccount(me(), "DELETE", NOW);
    expect(eraseCalls).toHaveLength(1);
    expect(eraseCalls[0]).toMatchObject({ userId: USER, actorUserId: USER, auditAction: "privacy.account_deleted_in_app" });
    expect(eraseCalls[0]).not.toHaveProperty("email");
    const email = (eraseCalls[0].confirmationEmail as () => { subject: string; text: string })();
    expect(email.subject).toBe("Your Givezy account has been deleted");
    expect(email.text).not.toMatch(/!/);
    expect(email.text).toMatch(/tax law requires/);
  });

  it("the audit rows name the person's id and the action, never an email, name or number", async () => {
    await deleteOwnAccount(me(), "DELETE", NOW);
    expect(audits).toEqual([{ action: "privacy.account_delete_started", actorUserId: USER, entityType: "user", entityId: USER, details: {} }]);
    expect(JSON.stringify(audits)).not.toMatch(/sam|example|@/i);
  });

  it("if the start cannot be written to the audit log, nothing is deleted", async () => {
    auditFails = true;
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "unavailable" });
    expectNothingTouched();
  });
});

describe("a donor is never charged again", () => {
  it("cancels every monthly donation, destroys the stored card token and the saved card", async () => {
    await stopAllCharging(USER, new Date(NOW));
    const recurring = writes.find((w) => w.table === "recurring_donations");
    expect(recurring?.patch).toMatchObject({ status: "cancelled", authorization_encrypted: null, ended_reason: "the donor deleted their account", card_last4: null });
    expect(writes.filter((w) => w.op === "delete").map((w) => w.table).sort()).toEqual(["card_save_requests", "saved_cards"]);
  });

  it("when the cancel cannot be done, refuses, keeps everything and says so", async () => {
    failing.add("recurring_donations.update");
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ ok: false, code: "cancel_failed" });
    expect((r.body as { message: string }).message).toMatch(/deleted nothing/);
    expect(order).not.toContain("erase");
    expect(audits.map((a) => a.action)).toContain("privacy.account_delete_refused");
  });

  it("when removing the saved card fails, refuses and erases nothing", async () => {
    failing.add("saved_cards.delete");
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.body).toMatchObject({ code: "cancel_failed" });
    expect(order).not.toContain("erase");
  });

  it("trusts nothing it has not read back: a cancel that left a live donation or card refuses", async () => {
    cancelDoesNothing = true;
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.body).toMatchObject({ code: "cancel_failed" });
    expect(order).not.toContain("erase");
    recurringLeft = 0;
    cancelDoesNothing = false;
    cardLeft = 1;
    failing.add("saved_cards.delete");
    expect(await stopAllCharging(USER)).toBe(false);
  });

  it("with no donor records (never gave) there is nothing to cancel, and the saved card is still cleared", async () => {
    donorIds = [];
    expect(await stopAllCharging(USER)).toBe(true);
    expect(writes.map((w) => w.table)).toEqual(["saved_cards", "card_save_requests"]);
  });
});

describe("what must be kept is never touched before the erasure", () => {
  it("writes only to the tables that could charge them: never donations, receipts, checkout details or audit rows", async () => {
    await deleteOwnAccount(me(), "DELETE", NOW);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(MAY_WRITE.has(w.table), w.table).toBe(true);
    // And a donation is only ever read (for the "charge on its way" check).
    expect(writes.some((w) => w.table === "donations")).toBe(false);
  });
});

describe("a run that is cut off can be repeated", () => {
  it("an erasure that stops part way says so, keeps the stopped charging, and pressing again finishes", async () => {
    eraseResult = new Error("Could not erase: connection lost");
    const first = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(first.status).toBe(500);
    expect(first.body).toMatchObject({ ok: false, code: "incomplete" });
    expect((first.body as { message: string }).message).toMatch(/already stopped/);

    eraseResult = { accountDeleted: true };
    cancelDoesNothing = false;
    recurringLeft = 0;
    cardLeft = 0;
    const second = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(second.status).toBe(200);
    expect(eraseCalls).toHaveLength(2);
  });

  it("the stopping of charges can run again when there is nothing left to stop", async () => {
    recurringLeft = 0;
    cardLeft = 0;
    expect(await stopAllCharging(USER)).toBe(true);
    expect(await stopAllCharging(USER)).toBe(true);
  });

  it("an erasure that finished but could not delete the sign-in account is not reported as done", async () => {
    eraseResult = { accountDeleted: false };
    const r = await deleteOwnAccount(me(), "DELETE", NOW);
    expect(r.body).toMatchObject({ ok: false, code: "incomplete" });
  });
});

describe("the checks themselves", () => {
  it("find nothing wrong with an ordinary donor", async () => {
    expect(await whyNotDeletable(USER, EMAIL, NOW, {})).toBeNull();
  });
  it("hold off for a monthly charge on its way", async () => {
    inFlight = 2;
    expect(await whyNotDeletable(USER, EMAIL, NOW, {})).toBe("payment_in_progress");
  });
});
