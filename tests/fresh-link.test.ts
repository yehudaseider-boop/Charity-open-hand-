/**
 * "Email me a fresh link" on an expired donation link (decided 23/11/2026): only to the email the gift was made with,
 * only when asked with that gift's own expired link, the same answer whatever exists, and limited.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ID = "3f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const limitCalls: { bucket: string; keys: string[] }[] = [];
let limited = new Set<string>();
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (bucket: string, keys: string[]) => (limitCalls.push({ bucket, keys }), limited.has(bucket)),
  ipKeys: (ip: string) => (ip && ip !== "unknown" ? [`ip:${ip}`] : []),
}));
let access: "valid" | "expired" | "none" = "expired";
const reissued: string[] = [];
vi.mock("@/lib/donations/confirmation-access", () => ({
  confirmationAccess: async () => access,
  reissueConfirmationToken: async (id: string) => (reissued.push(id), "N".repeat(43)),
}));
let gift: Record<string, unknown> | null;
const restored: unknown[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === "donations" ? gift : { token_hash: "a".repeat(64), created_at: "2026-09-01T10:00:00Z" }, error: null }),
        upsert: async (row: unknown) => (restored.push(row), { error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/email", async () => {
  class EmailMaybeSent extends Error {}
  return { EmailMaybeSent, getEmailTransport: () => ({ send: async () => "sent" }) };
});

const { requestFreshConfirmationLink, freshLinkEmail, FRESH_LINK_SENT, FRESH_LINK_LIMITED } = await import("@/lib/donations/fresh-link");
const { EmailMaybeSent } = await import("@/lib/email");

type Sent = { to: string; text: string; subject: string };
let sent: Sent[] = [];
const send = async (m: Sent) => {
  sent.push(m);
};
const ask = (o: { donationId?: string; token?: string; ip?: string; send?: (m: Sent) => Promise<void> } = {}) =>
  requestFreshConfirmationLink({ donationId: o.donationId ?? ID, token: o.token ?? "O".repeat(43), ip: o.ip ?? "203.0.113.7", send: o.send ?? send });

beforeEach(() => {
  process.env.SITE_URL = "https://test.givezy.co.za/";
  limitCalls.length = 0;
  limited = new Set();
  access = "expired";
  reissued.length = 0;
  restored.length = 0;
  sent = [];
  gift = { id: ID, charities: { name_en: "Northcliff Meals Fund" }, donation_checkout_details: { email: "donor@example.co.za" } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("email me a fresh link", () => {
  it("sends a new link only to the email the gift was made with", async () => {
    const r = await ask();
    expect(r).toEqual({ ok: true, message: FRESH_LINK_SENT });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("donor@example.co.za");
    expect(sent[0].text).toContain(`https://test.givezy.co.za/donate/return?reference=${ID}&t=${"N".repeat(43)}`);
    expect(sent[0].text).toContain("Northcliff Meals Fund");
    expect(reissued).toEqual([ID]);
  });

  it("never takes an address from the request: there is nowhere to give one", async () => {
    const r = await requestFreshConfirmationLink({ donationId: ID, token: "O".repeat(43), ip: "1.2.3.4", send, ...({ email: "attacker@example.com" } as object) });
    expect(r.ok).toBe(true);
    expect(sent.map((m) => m.to)).toEqual(["donor@example.co.za"]);
  });

  it("gives the same answer, and sends nothing, when the gift, the link or the email isn't there", async () => {
    const answers = [];
    access = "none"; // a wrong or made-up link
    answers.push(await ask());
    answers.push(await ask({ donationId: "not-a-reference" }));
    access = "valid"; // a link that still works needs nothing new
    answers.push(await ask());
    access = "expired";
    gift = null; // no such gift
    answers.push(await ask());
    gift = { id: ID, charities: null, donation_checkout_details: null }; // email erased at the donor's request
    answers.push(await ask());
    for (const a of answers) expect(a).toEqual({ ok: true, message: FRESH_LINK_SENT });
    expect(sent).toHaveLength(0);
    expect(reissued).toHaveLength(0);
  });

  it("counts every request by internet address before looking anything up", async () => {
    access = "none";
    await ask();
    expect(limitCalls[0]).toEqual({ bucket: "fresh-link-ip", keys: ["ip:203.0.113.7"] });
    // A stranger with only a donation reference never uses up the donor's own requests for that gift.
    expect(limitCalls.some((c) => c.bucket === "fresh-link-gift")).toBe(false);
  });

  it("over a limit, nothing is sent and the answer says so plainly", async () => {
    limited = new Set(["fresh-link-ip"]);
    expect(await ask()).toEqual({ ok: false, message: FRESH_LINK_LIMITED });
    limited = new Set(["fresh-link-gift"]);
    expect(await ask()).toEqual({ ok: false, message: FRESH_LINK_LIMITED });
    expect(sent).toHaveLength(0);
    expect(reissued).toHaveLength(0);
    expect(limitCalls.find((c) => c.bucket === "fresh-link-gift")?.keys).toEqual([`gift:${ID}`]);
  });

  it("a failed send says so, keeps nothing new, and puts the old link back so the donor can ask again", async () => {
    const r = await ask({ send: async () => Promise.reject(new Error("provider down")) });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Nothing has changed");
    expect(restored).toEqual([{ donation_id: ID, token_hash: "a".repeat(64), created_at: "2026-09-01T10:00:00Z" }]);
  });

  it("an email that may have left keeps its new link", async () => {
    const r = await ask({ send: async () => Promise.reject(new EmailMaybeSent("cut off")) });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("may not have gone");
    expect(restored).toHaveLength(0);
  });
});

describe("the fresh link email", () => {
  it("says what it is, how long it works, and what to do if it wasn't asked for", () => {
    const m = freshLinkEmail("d@example.co.za", "https://x/donate/return?reference=r&t=t", "Hillside Kitchen", 30);
    expect(m.subject).toBe("Your fresh link to your Givezy donation");
    expect(m.text).toContain("your donation to Hillside Kitchen");
    expect(m.text).toContain("works for 30 days");
    expect(m.text).toContain("s18A receipt");
    expect(m.text).toContain("Nothing has changed");
    expect(m.text).not.toMatch(/!|—/);
  });
});
