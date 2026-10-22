/** A charity thanking one donor personally: their first name, replies to the charity, at most once a week. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeDone, describeUndone, pageOf, ASK_FIRST } from "@/lib/charity/done";
import { emailHash, oneDonorThankYouEmail, weekStart } from "@/lib/charity/thank-you";

describe("the personal thank-you email", () => {
  it("greets by first name, signs with the charity, and says replies reach the charity", () => {
    const m = oneDonorThankYouEmail("sarah@x.co", { charityName: "Meals Fund", firstName: "Sarah", body: "Your gift fed a family this week.", stopUrl: "https://g.test/thanks/stop?t=x", replyTo: "office@meals.org" });
    expect(m.replyTo).toBe("office@meals.org");
    expect(m.subject).toBe("A thank-you from Meals Fund");
    expect(m.text).toMatch(/^Dear Sarah,\n\nYour gift fed a family this week\.\n\nFrom Meals Fund/);
    expect(m.text).toContain("Reply to this email to reach them.");
    expect(m.text).toContain("https://g.test/thanks/stop?t=x");
    expect(m.text).not.toMatch(/R\d|—|!/);
  });
  it("without a contact email there is no reply line", () => {
    const m = oneDonorThankYouEmail("a@x.co", { charityName: "Meals Fund", firstName: null, body: "Thank you so much.", stopUrl: "u", replyTo: null });
    expect(m.replyTo).toBeUndefined();
    expect(m.text).toMatch(/^Hello,/);
    expect(m.text).not.toContain("Reply to this email");
  });
  it("the week starts on Monday, Johannesburg time", () => {
    expect(weekStart(new Date("2026-10-18T10:00:00Z"))).toBe("2026-10-12"); // Sunday
    expect(weekStart(new Date("2026-10-18T22:30:00Z"))).toBe("2026-10-19"); // already Monday in Johannesburg
    expect(weekStart(new Date("2026-10-19T08:00:00Z"))).toBe("2026-10-19");
  });
  it("asks first, can't be taken back, and the panel shows on Donors", () => {
    expect(ASK_FIRST).toContain("donor_thanked");
    expect(pageOf("donor_thanked")).toBe("donors");
    expect(describeDone("donor_thanked", { name: "Sarah Cohen", replyTo: "office@meals.org" }, { base: "/b", publicUrl: null, approved: true }).what).toBe(
      "Your thank-you went to Sarah Cohen. If they reply, it goes to office@meals.org.",
    );
    expect(describeUndone("donor_thanked", {})).toBe("This can't be taken back.");
  });
});

vi.mock("server-only", () => ({}));
const sent: { to: string; text: string; replyTo?: string }[] = [];
let gift: unknown = null;
let stopped = false;
let claimed = false;
let failSend = false;
let skipSend = false;
let released = 0;
let recordedOnly = false;
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/email", () => ({
  getEmailTransport: () => ({
    send: async (m: { to: string; text: string; replyTo?: string }) => {
      if (failSend) throw new Error("down");
      if (skipSend) return "skipped";
      sent.push(m);
      return "sent";
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in"]) b[m] = () => b;
      // Gifts the charity recorded itself are left out: "recordedOnly" means this donor has no other.
      b.neq = (col: string, val: string) => (table === "donations" && col === "gateway" && val === "recorded" && recordedOnly ? ((b.maybeSingle = async () => ({ data: null, error: null })), b) : b);
      b.maybeSingle = async () => (table === "donations" ? { data: gift, error: null } : { data: stopped ? { email_hash: "h" } : null, error: null });
      b.delete = () => ({ eq: async () => ((released++), { error: null }) });
      b.insert = () => {
        if (table === "email_stop_tokens") return Promise.resolve({ error: null });
        return { select: () => ({ single: async () => (claimed ? { data: null, error: { code: "23505" } } : ((claimed = true), { data: { id: "t1" }, error: null })) }) };
      };
      return b;
    },
  }),
}));
const { sendDonorThankYou } = await import("@/lib/charity/thank-you-send");
const args = { charityId: "c1", charityName: "Meals Fund", donorId: "d1", body: "Thank you, truly.", userId: "u1", replyTo: "office@meals.org" };
const details = (over: Record<string, unknown> = {}) => ({ id: "g1", donation_checkout_details: { email: "sarah@x.co", first_name: "Sarah", last_name: "Cohen", donor_type: "individual", organisation_name: null, contact_person: null, erased_at: null, ...over } });

beforeEach(() => {
  sent.length = 0;
  claimed = false;
  stopped = false;
  failSend = false;
  skipSend = false;
  released = 0;
  recordedOnly = false;
  gift = details();
  process.env.SITE_URL = "https://g.test";
});

describe("sending one donor a thank-you", () => {
  it("sends once, with the charity as the reply address", async () => {
    expect(await sendDonorThankYou(args)).toEqual({ ok: true, name: "Sarah Cohen" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("sarah@x.co");
    expect(sent[0].replyTo).toBe("office@meals.org");
    expect(emailHash(sent[0].to)).toBe(emailHash("SARAH@x.co"));
  });
  it("never to someone whose only gifts the charity recorded itself (an email Givezy never checked)", async () => {
    recordedOnly = true;
    const r = await sendDonorThankYou(args);
    expect(r.ok === false && r.message).toMatch(/only gifts you recorded yourself/);
    expect(sent).toHaveLength(0);
  });
  it("only once a week per donor", async () => {
    await sendDonorThankYou(args);
    const again = await sendDonorThankYou(args);
    expect(again.ok === false && again.message).toMatch(/already thanked Sarah Cohen this week, so nothing was sent/);
    expect(sent).toHaveLength(1);
  });
  it("never to an erased donor or someone who asked not to get them", async () => {
    gift = details({ erased_at: "2026-10-01" });
    expect((await sendDonorThankYou(args)).ok).toBe(false);
    gift = details();
    stopped = true;
    const r = await sendDonorThankYou(args);
    expect(r.ok === false && r.message).toMatch(/asked not to get thank-you emails/);
    expect(sent).toHaveLength(0);
  });
  it("a failed send hands the week back, so the charity can try again", async () => {
    failSend = true;
    const r = await sendDonorThankYou(args);
    expect(r.ok === false && r.message).toMatch(/Nothing went out/);
    expect(released).toBe(1);
  });
  it("a send the email service skipped is reported as not sent, and the week is handed back", async () => {
    skipSend = true;
    const r = await sendDonorThankYou(args);
    expect(r.ok === false && r.message).toMatch(/nothing was sent/);
    expect(released).toBe(1);
    expect(sent).toHaveLength(0);
  });
  it("a company is greeted through its contact person", async () => {
    gift = details({ donor_type: "company", first_name: null, organisation_name: "Acme (Pty) Ltd", contact_person: "Thandi Mokoena" });
    expect(await sendDonorThankYou(args)).toEqual({ ok: true, name: "Acme (Pty) Ltd" });
    expect(sent[0].text).toMatch(/^Dear Thandi,/);
  });
});
