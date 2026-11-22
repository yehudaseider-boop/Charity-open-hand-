/**
 * The dashboard helper's lookups (22/11/2026): which tools are offered, how a call's input is checked, and how each
 * answer is worded for the model (amounts already in Rand, no contact details, anonymous donors kept anonymous).
 */
import { describe, expect, it } from "vitest";
import { checkToolCall, runTool, toolDefinitions, type HelperSource } from "@/lib/assistant/tools";
import { checkQuestion } from "@/lib/assistant/request";
import { stableInstructions } from "@/lib/assistant/prompt";

const source = (over: Partial<HelperSource> = {}): HelperSource => ({
  totals: async () => ({ label: "This month (November 2026)", gifts: 4, raisedCents: 125_050, donors: 3, s18aRequestedCents: 50_000, refunded: 1, refundedCents: 3_000, chargedBack: 0, pending: 1, failed: 2 }),
  byMonth: async () => [{ month: "November 2026", gifts: 4, raisedCents: 125_000, monthlyCents: 30_000 }],
  monthly: async () => ({ running: 2, perMonthCents: 60_000, retrying: 1, paused: 0, ended: 1, nextCharges: [{ day: "01/12/2026", amountCents: 30_000 }] }),
  setup: async () => ({
    status: "Draft",
    application: [{ label: "Organisation details", done: true, page: "dash:/application", who: null }, { label: "Bank confirmation letter", done: false, page: "dash:/application", who: null }],
    gettingStarted: [{ label: "Add your logo", done: false, page: "dash:/profile", who: null }],
  }),
  receipts: async () => [{ taxYear: 2027, label: "2026/27 tax year (01/03/2026 to 28/02/2027)", giftsWanting: 5, onIssued: 0, wantingCents: 200_000 }],
  recentGifts: async (limit, withNames) => [
    { date: "20/11/2026", amountCents: 50_000, status: "paid", donor: withNames ? "Thandi Mokoena" : null, monthly: false, anonymous: false },
    { date: "19/11/2026", amountCents: 30_000, status: "paid", donor: withNames ? "Pieter Botha" : null, monthly: true, anonymous: true },
  ].slice(0, limit),
  donors: async () => [
    { name: "Thandi Mokoena", gifts: 6, totalCents: 300_000, firstGift: "01/03/2026", lastGift: "20/11/2026", monthly: true },
    { name: "Anonymous donor", gifts: 1, totalCents: 10_000, firstGift: "02/11/2026", lastGift: "02/11/2026", monthly: false },
  ],
  ...over,
});

const run = async (name: string, input: unknown, donorData = false, src = source()) => {
  const call = checkToolCall(name, input, donorData);
  if (!call.ok) throw new Error(call.error);
  return JSON.parse(await runTool(call, src, donorData));
};

describe("the tools offered", () => {
  it("are read-only lookups, strict, with donors' names only behind the switch", () => {
    const without = toolDefinitions(false).map((t) => t.name);
    expect(without).toEqual(["giving_totals", "giving_by_month", "monthly_donations", "setup_progress", "receipts_progress", "recent_gifts"]);
    expect(toolDefinitions(true).map((t) => t.name)).toEqual([...without, "top_donors", "find_donor"]);
    for (const t of toolDefinitions(true)) {
      expect(t.strict).toBe(true);
      expect((t.input_schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
      expect(t.description).not.toMatch(/email address|phone number|ID number/i);
    }
  });

  it("are the same every time, so the start of each request is cached", () => {
    expect(JSON.stringify(toolDefinitions(true))).toBe(JSON.stringify(toolDefinitions(true)));
  });
});

describe("checking a call before it runs", () => {
  it("refuses unknown tools, bad periods and limits, and donor lookups without the switch", () => {
    expect(checkToolCall("delete_everything", {}, true).ok).toBe(false);
    expect(checkToolCall("giving_totals", { period: "forever" }, false).ok).toBe(false);
    expect(checkToolCall("giving_totals", null, false).ok).toBe(false);
    expect(checkToolCall("giving_totals", "this_month", false).ok).toBe(false);
    expect(checkToolCall("recent_gifts", { limit: 2.5 }, false).ok).toBe(false);
    expect(checkToolCall("top_donors", { limit: 3 }, false).ok).toBe(false);
    expect(checkToolCall("find_donor", { name: "Th" }, false).ok).toBe(false);
    expect(checkToolCall("find_donor", { name: "T" }, true).ok).toBe(false);
  });

  it("keeps limits between 1 and 10", () => {
    expect(checkToolCall("recent_gifts", { limit: 500 }, false)).toMatchObject({ ok: true, limit: 10 });
    expect(checkToolCall("recent_gifts", { limit: 0 }, false)).toMatchObject({ ok: true, limit: 1 });
  });
});

describe("what the model is told", () => {
  it("gives totals already written as Rand", async () => {
    expect(await run("giving_totals", { period: "this_month" })).toMatchObject({ period: "This month (November 2026)", raised: "R1 250.50", donors: 3, refunds: { count: 1, amount: "R30" }, pending: 1, failed: 2 });
  });

  it("gives monthly donations and the next collection days", async () => {
    expect(await run("monthly_donations", {})).toMatchObject({ running: 2, brings_in_each_month: "R600", being_retried_after_a_declined_card: 1, next_collections: [{ day: "01/12/2026", amount: "R300" }] });
  });

  it("gives what's left to set up, with the page and who does it", async () => {
    const s = await run("setup_progress", {});
    expect(s.status).toBe("Draft");
    expect(s.application_still_needs).toEqual([{ step: "Bank confirmation letter", done: false, page_link: "dash:/application" }]);
    expect(s.getting_started[0]).toEqual({ step: "Add your logo", done: false, page_link: "dash:/profile" });
  });

  it("without the donor switch, recent gifts carry no names", async () => {
    const gifts = await run("recent_gifts", { limit: 5 });
    expect(gifts).toHaveLength(2);
    expect(JSON.stringify(gifts)).not.toMatch(/Thandi|Pieter|donor/);
  });

  it("with the switch, names show, but an anonymous donor stays anonymous", async () => {
    const gifts = await run("recent_gifts", { limit: 5 }, true);
    expect(gifts.map((g: { donor: string }) => g.donor)).toEqual(["Thandi Mokoena", "Anonymous"]);
  });

  it("finds donors by part of a name, and says so plainly when there's no match", async () => {
    expect(await run("find_donor", { name: "thandi" }, true)).toEqual([{ name: "Thandi Mokoena", gifts: 6, total_given: "R3 000", first_gift: "01/03/2026", last_gift: "20/11/2026", gives_monthly: true }]);
    expect(await run("find_donor", { name: "Nobody" }, true)).toMatchObject({ found: 0 });
    expect(await run("top_donors", { limit: 1 }, true)).toHaveLength(1);
  });

  it("never sends an email address or phone number, whatever the source holds", async () => {
    const leaky = source({
      donors: async () => [{ name: "Thandi Mokoena", gifts: 1, totalCents: 100, firstGift: null, lastGift: null, monthly: null, email: "t@x.co", phone: "0821234567" } as never],
    });
    const out = JSON.stringify(await run("top_donors", { limit: 5 }, true, leaky));
    expect(out).not.toContain("t@x.co");
    expect(out).not.toContain("0821234567");
  });
});

describe("the conversation sent with each question", () => {
  it("caps earlier answers and the whole history, keeping the question (review 21/11/2026)", () => {
    const long = "x".repeat(5000);
    const messages = [
      ...Array.from({ length: 5 }, () => [{ role: "user", content: "q" }, { role: "assistant", content: long }]).flat(),
      { role: "user", content: "How much came in?" },
    ];
    const c = checkQuestion({ charityId: "11111111-2222-3333-4444-555555555555", messages });
    if (!c.ok) throw new Error(c.message);
    expect(c.messages.every((m) => m.role === "user" || m.content.length <= 1500)).toBe(true);
    expect(c.messages.reduce((t, m) => t + m.content.length, 0)).toBeLessThanOrEqual(8000);
    expect(c.messages[0].role).toBe("user");
    expect(c.messages[c.messages.length - 1].content).toBe("How much came in?");
  });
});

describe("the instructions", () => {
  it("say it looks things up first, never guesses a figure, and reads only", () => {
    const text = stableInstructions({ whatsApp: null, email: "hello@givezy.co.za" });
    expect(text).toMatch(/look it up with a tool first/);
    expect(text).toMatch(/Never guess or work out a figure yourself/);
    expect(text).toMatch(/can't change, send, approve or delete/);
    expect(text).toMatch(/can't see individual donors' names/);
    expect(stableInstructions({ whatsApp: null, email: null }, true)).toMatch(/look up donors by name/);
  });
});
