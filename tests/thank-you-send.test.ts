/** Sending a charity's thank-you: once per address, never to erased or opted-out donors, once per month, and finishable. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailHash } from "@/lib/charity/thank-you";

vi.mock("server-only", () => ({}));
const sent: { to: string; text: string }[] = [];
let donations: unknown[] = [];
let optedOut: string[] = [];
// The month's claim row, and the addresses claimed for it (hash -> status).
let month: { id: string; body: string; finished_at: string | null } | null = null;
let recipients = new Map<string, string>();
let statusSaveFails = false;
const neqs: string[] = [];
const tokens: Record<string, string>[] = [];
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async (m: { to: string; text: string }) => (sent.push(m), "sent") }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      for (const m of ["select", "gte", "lt", "order", "delete"]) b[m] = () => b;
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
      b.in = async (_c: string, hashes: string[]) => ({ data: hashes.filter((h) => optedOut.includes(h)).map((h) => ({ email_hash: h })), error: null });
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
      b.upsert = (row: { email_hash: string }) => ({
        select: async () => {
          if (recipients.has(row.email_hash)) return { data: [], error: null };
          recipients.set(row.email_hash, "sending");
          return { data: [{ email_hash: row.email_hash }], error: null };
        },
      });
      b.then = (ok: (v: unknown) => unknown) => {
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
const gift = (email: string, first: string | null, erased = false) => ({ id: email, donation_checkout_details: { email, first_name: first, erased_at: erased ? "2026-10-01" : null } });
const args = { charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", body: "Thank you, truly.", userId: "u1" };

beforeEach(() => {
  sent.length = 0;
  tokens.length = 0;
  month = null;
  recipients = new Map();
  optedOut = [];
  statusSaveFails = false;
  process.env.SITE_URL = "https://g.test";
});

describe("sending a thank-you", () => {
  it("emails each address once, skipping erased and opted-out donors", async () => {
    donations = [gift("sarah@x.co", "Sarah"), gift("SARAH@x.co", "Sarah"), gift("erased+1@erased.invalid", null), gift("gone@x.co", "Gone", true), gift("stop@x.co", "Stop"), gift("david@x.co", "David")];
    optedOut = [emailHash("stop@x.co")];
    const r = await sendThankYou(args);
    expect(r).toMatchObject({ ok: true, sent: 2, failed: 0, remaining: 0 });
    expect(sent.map((m) => m.to)).toEqual(["sarah@x.co", "david@x.co"]);
    expect(sent[0].text).toMatch(/https:\/\/g\.test\/thanks\/stop\?t=[A-Za-z0-9_-]{43}/);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].email_hash).toBe(emailHash("sarah@x.co"));
    expect(month?.finished_at).not.toBeNull();
    // Only people who gave on Givezy: never an address a charity typed into a recorded gift.
    expect(neqs).toContain("donations.gateway!=recorded");
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
