/** Sending a charity's thank-you: once per address, never to erased or opted-out donors, once per month, and finishable. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { emailHash } from "@/lib/email-fingerprint";

/** The plain hash stored before 24/11/2026. */
const plain = (e: string) => createHash("sha256").update(e.trim().toLowerCase()).digest("hex");

vi.mock("server-only", () => ({}));
const sent: { to: string; text: string; headers?: Record<string, string>; signal?: AbortSignal }[] = [];
let donations: unknown[] = [];
let optedOut: string[] = [];
// The month's claim row, and the addresses claimed for it (hash -> status).
let month: { id: string; body: string; finished_at: string | null } | null = null;
let recipients = new Map<string, string>();
/** Claims stored at the plain hash (version 1, before 24/11/2026); every other claim is keyed. */
let plainClaims = new Set<string>();
const claimRpcs: { p_keyed: string; p_plain: string }[] = [];
/** Runs just before a claim: older code claiming the same address at its plain hash in between. */
let beforeClaim: (() => void) | null = null;
let statusSaveFails = false;
const neqs: string[] = [];
const tokens: Record<string, string>[] = [];
/** Donors who already had a message from the charity this week, and what the check was asked. */
let messaged = new Set<string>();
const weekChecks: { donors: { donorId: string; email: string }[]; except: unknown }[] = [];
vi.mock("@/lib/charity/weekly-limit", () => ({
  WEEKLY_LIMIT: "Givezy sends each donor at most one message a week from your charity.",
  messagedThisWeek: async (_c: string, donors: { donorId: string; email: string }[], _now: Date, except: unknown) => (weekChecks.push({ donors, except }), new Set(donors.map((d) => d.donorId).filter((id) => messaged.has(id)))),
}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
/** Addresses whose send throws as a dropped connection would. */
let dropFor = new Set<string>();
/** Addresses the email service skips ("skipped": surely not sent). */
let skipFor = new Set<string>();
const { MaybeSent, Refused } = vi.hoisted(() => ({
  MaybeSent: class EmailMaybeSent extends Error {},
  Refused: class EmailError extends Error {
    constructor(message: string, readonly status?: number) {
      super(message);
    }
  },
}));
/** Addresses for which the email service says "too many, slow down" (429). */
let busyFor = new Set<string>();
/** Address hashes that stopped every email from this charity with its own stop link. */
let charityStops: string[] = [];
vi.mock("@/lib/email", () => ({
  EmailError: Refused,
  EmailMaybeSent: MaybeSent,
  isTemporaryRefusal: (e: unknown) => e instanceof Refused && e.status === 429,
  getEmailTransport: () => ({
    send: async (m: { to: string; text: string }) => {
      if (dropFor.has(m.to)) throw new MaybeSent("fetch failed");
      if (skipFor.has(m.to)) return "skipped";
      if (busyFor.has(m.to)) throw new Refused("Resend refused the email (429).", 429);
      return (sent.push(m), "sent");
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    // claim_thank_you_recipient(): claims the keyed value only when neither it nor the plain one is claimed.
    rpc: async (name: string, a: { p_keyed: string; p_plain: string }) => {
      if (name !== "claim_thank_you_recipient") return { data: null, error: { message: `no ${name}` } };
      claimRpcs.push(a);
      beforeClaim?.();
      if (recipients.has(a.p_keyed) || recipients.has(a.p_plain)) return { data: false, error: null };
      recipients.set(a.p_keyed, "sending");
      return { data: true, error: null };
    },
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      let deleting = false;
      for (const m of ["select", "gte", "lt", "order"]) b[m] = () => b;
      b.delete = () => ((deleting = true), b);
      b.eq = (col: string, val: unknown) => ((filters[col] = val), b);
      b.update = (p: Record<string, unknown>) => ((patch = p), b);
      b.neq = (col: string, val: string) => (neqs.push(`${table}.${col}!=${val}`), b);
      b.range = async (from: number) => {
        if (table === "charity_thank_you_recipients") {
          const rows = [...recipients].map(([email_hash, status]) => ({ email_hash, status }));
          return { data: from === 0 ? rows : [], error: null };
        }
        return { data: from === 0 ? donations : [], error: null };
      };
      // .in("source", ...) narrows a charity's own stops; the address list comes last.
      b.in = (c: string, hashes: string[]) =>
        c === "source"
          ? b
          : table === "charity_thank_you_recipients"
            ? Promise.resolve({ data: hashes.filter((h) => recipients.has(h)).map((h) => ({ email_hash: h, email_hash_v: plainClaims.has(h) ? 1 : 2 })), error: null })
            : Promise.resolve({ data: hashes.filter((h) => (table === "charity_email_opt_outs" ? charityStops : optedOut).includes(h)).map((h) => ({ email_hash: h })), error: null });
      b.maybeSingle = async () => ({ data: month, error: null });
      b.insert = (row: Record<string, string>) => {
        if (table === "email_stop_tokens") {
          tokens.push(row);
          return Promise.resolve({ error: null });
        }
        return {
          select: () => ({
            single: async () => (month ? { data: null, error: { code: "23505" } } : ((month = { id: "t1", body: row.body, finished_at: null }), { data: { id: "t1" }, error: null })),
          }),
        };
      };
      b.then = (ok: (v: unknown) => unknown) => {
        if (deleting && table === "charity_thank_you_recipients") recipients.delete(filters.email_hash as string);
        // Handing the month back deletes it, and its claims with it (on delete cascade).
        if (deleting && table === "charity_thank_yous") {
          month = null;
          recipients = new Map();
        }
        if (patch && table === "charity_thank_you_recipients") {
          if (statusSaveFails) return Promise.resolve({ error: { message: "down" } }).then(ok);
          recipients.set(filters.email_hash as string, patch.status as string);
        }
        if (patch && table === "charity_thank_yous" && month && "finished_at" in patch) month.finished_at = patch.finished_at as string;
        return Promise.resolve({ error: null }).then(ok);
      };
      return b;
    },
  }),
}));

const { continueThankYou, sendThankYou } = await import("@/lib/charity/thank-you-send");
const gift = (email: string, first: string | null, erased = false, refunded_cents = 0) => ({ id: email, donor_id: `d-${email.toLowerCase()}`, amount_cents: 10_000, refunded_cents, donation_checkout_details: { email, first_name: first, erased_at: erased ? "2026-10-01" : null } });
const args = { charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", body: "Thank you, truly.", userId: "u1" };

beforeEach(() => {
  sent.length = 0;
  busyFor = new Set();
  charityStops = [];
  tokens.length = 0;
  month = null;
  recipients = new Map();
  plainClaims = new Set();
  claimRpcs.length = 0;
  beforeClaim = null;
  optedOut = [];
  statusSaveFails = false;
  messaged = new Set();
  dropFor = new Set();
  skipFor = new Set();
  weekChecks.length = 0;
  process.env.SITE_URL = "https://g.test";
});

describe("sending a thank-you", () => {
  it("someone who stopped this charity's emails with its own stop link gets no thank-you from it (16/11/2026)", async () => {
    donations = [gift("sarah@x.co", "Sarah"), gift("david@x.co", "David")];
    charityStops = [emailHash("sarah@x.co")];
    const r = await sendThankYou(args);
    expect(r).toMatchObject({ ok: true, sent: 1 });
    expect(sent.map((m) => m.to)).toEqual(["david@x.co"]);
  });

  it("the email service saying 'not now' stops the run and hands the address back for Send the rest (review 16/11/2026)", async () => {
    donations = [gift("ann@x.co", "Ann"), gift("ben@x.co", "Ben"), gift("cat@x.co", "Cat")];
    busyFor = new Set(["ben@x.co"]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendThankYou(args);
    err.mockRestore();
    expect(sent.map((m) => m.to)).toEqual(["ann@x.co"]);
    expect(r).toMatchObject({ ok: true, sent: 1, failed: 0, remaining: 2 });
    expect(month?.finished_at).toBeNull();
    busyFor = new Set();
    await continueThankYou(args);
    expect(sent.map((m) => m.to)).toEqual(["ann@x.co", "ben@x.co", "cat@x.co"]);
    expect(month?.finished_at).not.toBeNull();
  });

  it("a gift refunded in full in part refunds is a refund, not a gift: no thank-you for it; a part refund still gets one (21/11/2026)", async () => {
    donations = [gift("all@x.co", "All", false, 10_000), gift("part@x.co", "Part", false, 4_000)];
    const r = await sendThankYou(args);
    expect(r).toMatchObject({ ok: true, sent: 1, remaining: 0 });
    expect(sent.map((m) => m.to)).toEqual(["part@x.co"]);
  });

  it("carried on by the daily job, each email has an 8-second limit; a person's press has none (review 21/11/2026)", async () => {
    donations = [gift("ann@x.co", "Ann")];
    await sendThankYou(args);
    expect(sent[0].signal).toBeUndefined();
    donations = [gift("ann@x.co", "Ann"), gift("ben@x.co", "Ben")];
    month!.finished_at = null;
    await continueThankYou({ ...args, userId: null, auto: true });
    expect(sent[1].to).toBe("ben@x.co");
    expect(sent[1].signal).toBeInstanceOf(AbortSignal);
    expect(sent[1].signal?.aborted).toBe(false);
  });

  it("a job send cut off by its time limit may have gone: it stays 'sending', never sent again", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B")];
    month = { id: "t1", body: "Thank you, truly.", finished_at: null };
    dropFor = new Set(["a@x.co"]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await continueThankYou({ ...args, userId: null, auto: true });
    err.mockRestore();
    expect(recipients.get(emailHash("a@x.co"))).toBe("sending");
    expect(r).toMatchObject({ ok: true, sent: 1 });
    dropFor = new Set();
    await continueThankYou({ ...args, userId: null, auto: true });
    expect(sent.map((m) => m.to)).toEqual(["b@x.co"]);
  });

  it("emails each address once, skipping erased and opted-out donors", async () => {
    donations = [gift("sarah@x.co", "Sarah"), gift("SARAH@x.co", "Sarah"), gift("erased+1@erased.invalid", null), gift("gone@x.co", "Gone", true), gift("stop@x.co", "Stop"), gift("david@x.co", "David")];
    optedOut = [emailHash("stop@x.co")];
    const r = await sendThankYou(args);
    expect(r).toMatchObject({ ok: true, sent: 2, failed: 0, remaining: 0 });
    expect(sent.map((m) => m.to)).toEqual(["sarah@x.co", "david@x.co"]);
    expect(sent[0].text).toMatch(/https:\/\/g\.test\/thanks\/stop\?t=[A-Za-z0-9_-]{43}/);
    // The mail app's one-click stop carries the same token as the link in the email.
    const token = sent[0].text.match(/thanks\/stop\?t=([A-Za-z0-9_-]{43})/)![1];
    expect(sent[0].headers).toEqual({ "List-Unsubscribe": `<https://g.test/api/stop/thanks?t=${token}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].email_hash).toBe(emailHash("sarah@x.co"));
    expect(month?.finished_at).not.toBeNull();
    // Only people who gave on Givezy: never an address a charity typed into a recorded gift.
    expect(neqs).toContain("donations.gateway!=recorded");
  });

  it("leaves out donors who already had a message from the charity this week, and says how many", async () => {
    donations = [gift("sarah@x.co", "Sarah"), gift("david@x.co", "David")];
    messaged = new Set(["d-sarah@x.co"]);
    const r = await sendThankYou(args);
    expect(r).toMatchObject({ ok: true, sent: 1, failed: 0, remaining: 0, thisWeek: 1 });
    expect(sent.map((m) => m.to)).toEqual(["david@x.co"]);
    // This thank-you's own claims never count against it.
    expect(weekChecks[0].except).toEqual({ thankYouId: "t1" });
    expect(weekChecks[0].donors).toEqual([{ donorId: "d-sarah@x.co", email: "sarah@x.co" }, { donorId: "d-david@x.co", email: "david@x.co" }]);
  });

  it("those left out don't use up the month: it stays unfinished, and Send the rest reaches them once their week has passed", async () => {
    donations = [gift("sarah@x.co", "Sarah"), gift("david@x.co", "David")];
    messaged = new Set(["d-sarah@x.co"]);
    const r = await sendThankYou(args);
    expect(r).toMatchObject({ ok: true, sent: 1, remaining: 0, thisWeek: 1 });
    // When Send the rest can reach them: the next Monday, dd/mm/yyyy.
    expect(r.ok && r.from).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(month?.finished_at).toBeNull();
    // Still the same week: nothing more goes, and it stays open.
    const sameWeek = await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" });
    expect(sameWeek).toMatchObject({ ok: true, sent: 1, thisWeek: 1 });
    expect(month?.finished_at).toBeNull();
    // The week after: Sarah gets it, David isn't emailed twice, and it is finished.
    messaged = new Set();
    const later = await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" });
    expect(later).toMatchObject({ ok: true, sent: 2, remaining: 0, thisWeek: 0 });
    expect(later.ok && later.from).toBeUndefined();
    expect(sent.map((m) => m.to)).toEqual(["david@x.co", "sarah@x.co"]);
    expect(month?.finished_at).not.toBeNull();
  });

  it("a dropped connection may have sent it: the address stays 'sending' (counted as not sent), never marked failed or sent again", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B")];
    dropFor = new Set(["a@x.co"]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendThankYou(args);
    err.mockRestore();
    expect(recipients.get(emailHash("a@x.co"))).toBe("sending");
    expect(r).toMatchObject({ ok: true, sent: 1, failed: 1 });
    dropFor = new Set();
    expect(await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" })).toEqual({ ok: false, message: "This thank-you has already reached everyone." });
    expect(sent.map((m) => m.to)).toEqual(["b@x.co"]);
  });

  it("every send cut off (may have gone): the month is kept, never handed back, so a second press can't email them again (review 23/11/2026)", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B")];
    dropFor = new Set(["a@x.co", "b@x.co"]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendThankYou(args);
    err.mockRestore();
    expect(r).toMatchObject({ ok: true, sent: 0, failed: 2, maybeSent: 2, sentThisRun: 0 });
    expect(month).not.toBeNull();
    expect(recipients.get(emailHash("a@x.co"))).toBe("sending");
    expect(recipients.get(emailHash("b@x.co"))).toBe("sending");
    dropFor = new Set();
    expect(await sendThankYou(args)).toEqual({ ok: false, message: "You've already thanked the donors for that month." });
    expect(sent).toHaveLength(0);
  });

  it("every send surely refused (none may have gone): the month is handed back so the charity can try again", async () => {
    donations = [gift("a@x.co", "A")];
    skipFor = new Set(["a@x.co"]);
    const r = await sendThankYou(args);
    expect(r).toEqual({ ok: false, message: "We couldn't send your thank-you just now. Nothing went out, so please try again in a few minutes." });
    expect(month).toBeNull();
  });

  it("when everyone already had a message this week, nothing is sent and the month is handed back", async () => {
    donations = [gift("sarah@x.co", "Sarah")];
    messaged = new Set(["d-sarah@x.co"]);
    const r = await sendThankYou(args);
    expect(r).toEqual({
      ok: false,
      message: "Everyone who gave that month already had a message from you this week, so nothing was sent. Givezy sends each donor at most one message a week from your charity. You can send this thank-you from Monday.",
    });
    expect(sent).toHaveLength(0);
  });

  it("only once for a month", async () => {
    donations = [gift("sarah@x.co", "Sarah")];
    await sendThankYou(args);
    const again = await sendThankYou(args);
    expect(again).toEqual({ ok: false, message: "You've already thanked the donors for that month." });
    expect(sent).toHaveLength(1);
  });

  it("stops when time runs out, then 'Send the rest' finishes without emailing anyone twice", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B"), gift("c@x.co", "C")];
    // No time at all: nothing is claimed, and the month stays open to finish.
    const first = await sendThankYou({ ...args, budgetMs: 0 });
    expect(first).toMatchObject({ ok: true, sent: 0, failed: 0, remaining: 3 });
    expect(month?.finished_at).toBeNull();
    // One already went out before the page stopped (claimed and sent).
    recipients.set(emailHash("a@x.co"), "sent");
    const rest = await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" });
    expect(rest).toMatchObject({ ok: true, sent: 3, failed: 0, remaining: 0 });
    expect(sent.map((m) => m.to)).toEqual(["b@x.co", "c@x.co"]);
    expect(month?.finished_at).not.toBeNull();
    expect(await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" })).toEqual({ ok: false, message: "This thank-you has already reached everyone." });
  });

  it("a claim made before 24/11/2026 (a plain hash) is found and never claimed or sent again (review 24/11/2026)", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B")];
    await sendThankYou({ ...args, budgetMs: 0 });
    recipients.set(plain("a@x.co"), "sent");
    plainClaims.add(plain("a@x.co"));
    const rest = await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" });
    expect(sent.map((m) => m.to)).toEqual(["b@x.co"]);
    // Read back as the keyed fingerprint, so no claim is even tried for it; only b is claimed, keyed with its plain twin.
    expect(claimRpcs).toEqual([{ p_thank_you_id: "t1", p_keyed: emailHash("b@x.co"), p_plain: plain("b@x.co") }]);
    expect(rest).toMatchObject({ ok: true, sent: 2, remaining: 0 });
  });

  it("a claim whose plain twin appears after the read doesn't send: the claim itself refuses it", async () => {
    donations = [gift("a@x.co", "A")];
    await sendThankYou({ ...args, budgetMs: 0 });
    // Older code still running during a deploy claims the same address at its plain hash, after this run read the claims.
    beforeClaim = () => recipients.set(plain("a@x.co"), "sending");
    await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" });
    expect(claimRpcs).toHaveLength(1);
    expect(sent).toEqual([]);
    expect(recipients.has(emailHash("a@x.co"))).toBe(false);
  });

  it("an address claimed by a stopped page is never sent again, and counts as not sent", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B")];
    await sendThankYou({ ...args, budgetMs: 0 });
    recipients.set(emailHash("a@x.co"), "sending");
    const rest = await continueThankYou({ charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", userId: "u1" });
    expect(sent.map((m) => m.to)).toEqual(["b@x.co"]);
    expect(rest).toMatchObject({ ok: true, sent: 1, failed: 1, remaining: 0 });
  });

  it("emails that went out are never sent again, even if their status couldn't be saved", async () => {
    donations = [gift("a@x.co", "A"), gift("b@x.co", "B")];
    statusSaveFails = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendThankYou(args);
    err.mockRestore();
    // The month is kept (not handed back), so pressing again can't email them a second time.
    expect(r.ok).toBe(true);
    expect(month).not.toBeNull();
    expect(await sendThankYou(args)).toEqual({ ok: false, message: "You've already thanked the donors for that month." });
    expect(sent.map((m) => m.to)).toEqual(["a@x.co", "b@x.co"]);
  });
});
