/** Sending a charity's thank-you: once per address, never to erased or opted-out donors, once per month. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailHash } from "@/lib/charity/thank-you";

vi.mock("server-only", () => ({}));
const sent: { to: string; text: string }[] = [];
let donations: unknown[] = [];
let optedOut: string[] = [];
let claimed = false;
const tokens: Record<string, string>[] = [];
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: async (m: { to: string; text: string }) => void sent.push(m) }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lt", "order", "update"]) b[m] = () => b;
      b.range = async () => ({ data: donations, error: null });
      b.in = async (_c: string, hashes: string[]) => ({ data: hashes.filter((h) => optedOut.includes(h)).map((h) => ({ email_hash: h })), error: null });
      b.insert = (row: Record<string, string>) => {
        if (table === "email_stop_tokens") {
          tokens.push(row);
          return Promise.resolve({ error: null });
        }
        return { select: () => ({ single: async () => (claimed ? { data: null, error: { code: "23505" } } : ((claimed = true), { data: { id: "t1" }, error: null })) }) };
      };
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok);
      return b;
    },
  }),
}));

const { sendThankYou } = await import("@/lib/charity/thank-you-send");
const gift = (email: string, first: string | null, erased = false) => ({ id: email, donation_checkout_details: { email, first_name: first, erased_at: erased ? "2026-10-01" : null } });
const args = { charityId: "c1", charityName: "Meals Fund", month: "2026-10-01", body: "Thank you, truly.", userId: "u1" };

beforeEach(() => {
  sent.length = 0;
  tokens.length = 0;
  claimed = false;
  optedOut = [];
  process.env.SITE_URL = "https://g.test";
});

describe("sending a thank-you", () => {
  it("emails each address once, skipping erased and opted-out donors", async () => {
    donations = [gift("sarah@x.co", "Sarah"), gift("SARAH@x.co", "Sarah"), gift("erased+1@erased.invalid", null), gift("gone@x.co", "Gone", true), gift("stop@x.co", "Stop"), gift("david@x.co", "David")];
    optedOut = [emailHash("stop@x.co")];
    const r = await sendThankYou(args);
    expect(r).toEqual({ ok: true, sent: 2, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual(["sarah@x.co", "david@x.co"]);
    expect(sent[0].text).toMatch(/https:\/\/g\.test\/thanks\/stop\?t=[A-Za-z0-9_-]{43}/);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].email_hash).toBe(emailHash("sarah@x.co"));
  });
  it("only once for a month", async () => {
    donations = [gift("sarah@x.co", "Sarah")];
    await sendThankYou(args);
    const again = await sendThankYou(args);
    expect(again).toEqual({ ok: false, message: "You've already thanked the donors for that month." });
    expect(sent).toHaveLength(1);
  });
});
