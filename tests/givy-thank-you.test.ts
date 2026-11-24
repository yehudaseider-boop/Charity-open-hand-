/**
 * Givy prepares a thank-you, a person sends it (24/11/2026): the draft's checks, the panel's button, the tool's
 * refusals, the kept draft (scoped to the charity and the person, and short-lived), and the in-app copy (only for
 * linked app accounts, only by the server, nothing before the migration). The database is a stand-in here; the real
 * access rules are checked in givy-thank-you-db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Every call to the stand-in database: table, what was done, and the filters. */
const db = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }[],
  insertError: null as null | { code?: string; message: string },
  selectResult: { data: null as unknown, error: null as null | { code?: string; message: string } },
  donors: [] as { id: string; user_id: string | null }[],
  upsertError: null as null | { code?: string; message: string },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let op = "select";
      let payload: unknown;
      const record = () => db.calls.push({ table, op, filters, payload });
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (p: unknown) => ((op = "insert"), (payload = p), q),
        upsert: async (p: unknown, o: unknown) => ((op = "upsert"), (payload = { rows: p, o }), record(), { error: db.upsertError }),
        delete: () => ((op = "delete"), q),
        eq: (c: string, v: unknown) => ((filters[`eq:${c}`] = v), q),
        gt: (c: string, v: unknown) => ((filters[`gt:${c}`] = v), q),
        lt: (c: string, v: unknown) => ((filters[`lt:${c}`] = v), record(), Promise.resolve({ error: null })),
        in: (c: string, v: unknown) => ((filters[`in:${c}`] = v), q),
        not: (c: string, o: string, v: unknown) => ((filters[`not:${c}:${o}`] = v), record(), Promise.resolve({ data: db.donors, error: null })),
        single: async () => (record(), db.insertError ? { data: null, error: db.insertError } : { data: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }, error: null }),
        maybeSingle: async () => (record(), db.selectResult),
      };
      return q;
    },
  }),
}));
const sent = vi.hoisted(() => ({ count: 0, picked: [] as unknown[] }));
vi.mock("@/lib/charity/appeals", () => ({
  pickAudience: async (_c: string, a: unknown) => (sent.picked.push(a), { donors: [{ display_name: "Thandi" }, { display_name: "Sipho" }], label: "Gave this month", stopped: 0, thisWeek: 0, recordedOnly: 0 }),
  sendAppeal: async () => void sent.count++,
  createAppeal: async () => void sent.count++,
}));

const { checkDraft, thanksHref, thanksMark, GIVY_AUDIENCE_KEYS } = await import("@/lib/assistant/thank-you-draft");
const { parseAudience, audienceValue } = await import("@/lib/charity/appeals-rules");
const { checkToolCall, runPrepare, runTool, toolDefinitions } = await import("@/lib/assistant/tools");
const { splitNext } = await import("@/lib/assistant/suggestions");
const { askerContext, stableInstructions } = await import("@/lib/assistant/prompt");
const { livePreparer, loadDraft, saveDraft } = await import("@/lib/assistant/drafts");
const { inAppRows, writeInAppMessages } = await import("@/lib/charity/donor-messages");
const { showsInApp } = await import("@/lib/charity/appeals-rules");

const CHARITY = "11111111-2222-3333-4444-555555555555";
const BASE = `/charity-admin/${CHARITY}`;
const good = { audience: "gave:this_month", subject: "Thank you for giving this month", message: "Thank you for standing with us.\n\nYour gift keeps our kitchen running each week." };

beforeEach(() => {
  db.calls = [];
  db.insertError = null;
  db.upsertError = null;
  db.selectResult = { data: null, error: null };
  db.donors = [];
  sent.count = 0;
  sent.picked = [];
});

describe("what Givy writes", () => {
  it("is kept as written when it follows the rules", () => {
    expect(checkDraft(good)).toEqual({ ok: true, audience: "gave:this_month", subject: good.subject, body: good.message });
  });
  it("never has figures, links, exclamation marks, markup or its own greeting", () => {
    expect(checkDraft({ ...good, message: "Your gift fed 20 families this winter." })).toMatchObject({ ok: false, error: expect.stringContaining("number") });
    expect(checkDraft({ ...good, subject: "R500 thank you" })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, message: "Thank you so much for your gift!" })).toMatchObject({ ok: false, error: "No exclamation marks." });
    expect(checkDraft({ ...good, message: "Thank you. See https://evil.example for more." })).toMatchObject({ ok: false, error: expect.stringContaining("web addresses") });
    expect(checkDraft({ ...good, message: "Thank you. Visit www.example for more about us." })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, message: "Thank you <b>so</b> much for your gift." })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, message: "Dear friend, thank you for your gift this month." })).toMatchObject({ ok: false, error: expect.stringContaining("greeting") });
  });
  it("is the right length, and for one of our fixed audiences only", () => {
    expect(checkDraft({ ...good, message: "Thanks" })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, message: "a".repeat(1501) })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, subject: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, audience: "tag:11111111-2222-3333-4444-555555555555" })).toMatchObject({ ok: false });
    expect(checkDraft({ ...good, audience: "everyone" })).toMatchObject({ ok: false });
  });
  it("loses hidden control and text-direction characters", () => {
    const r = checkDraft({ ...good, message: "Thank you‮ for your gift this month." });
    expect(r).toMatchObject({ ok: true, body: "Thank you for your gift this month." });
  });
});

describe("Givy's audiences", () => {
  it("are all ones the Email donors page already understands, and round-trip", () => {
    for (const k of GIVY_AUDIENCE_KEYS) {
      const a = parseAudience(k);
      expect(a, k).not.toBeNull();
      expect(audienceValue(a!)).toBe(k);
    }
  });
});

describe("the panel's button", () => {
  it("is our own marker, at the very end, before the follow-ups", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const text = `I prepared it.${thanksMark({ draftId: id, audience: "monthly" })}\n[[next:prepare_thank_you]]`;
    expect(splitNext(text)).toEqual({ text: "I prepared it.", tools: ["prepare_thank_you"], thanks: `d=${id}` });
    expect(thanksMark({ draftId: null, audience: "s18a:asked" })).toBe("\n[[thanks:to=s18a:asked]]");
  });
  it("is hidden while it streams in, piece by piece", () => {
    const full = "Done.\n[[thanks:d=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]]\n[[next:prepare_thank_you]]";
    for (let n = "Done.".length; n < full.length; n++) {
      // (A lone line break before the marker shows as nothing: the answer drops blank lines.)
      expect(splitNext(full.slice(0, n)).text.trimEnd(), full.slice(0, n)).toBe("Done.");
    }
  });
  it("goes only to this dashboard's Email donors page, with a draft id or a fixed audience", () => {
    expect(thanksHref("d=AAAAAAAA-bbbb-cccc-dddd-eeeeeeeeeeee", BASE)).toBe(`${BASE}/email-donors?draft=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`);
    expect(thanksHref("to=gave:this_tax_year", BASE)).toBe(`${BASE}/email-donors?to=gave%3Athis_tax_year`);
    expect(thanksHref("to=tag:11111111-2222-3333-4444-555555555555", BASE)).toBeNull();
    expect(thanksHref("d=../../admin", BASE)).toBeNull();
    expect(thanksHref("to=javascript:alert", BASE)).toBeNull();
    // Never on the demo.
    expect(thanksHref("to=monthly", "/demo/dashboard")).toBeNull();
  });
});

describe("the prepare_thank_you tool", () => {
  it("is offered only when the person may email donors, last, so the cached start stays the same", () => {
    expect(toolDefinitions(false).map((t) => t.name)).not.toContain("prepare_thank_you");
    const names = toolDefinitions(false, true).map((t) => t.name);
    expect(names[names.length - 1]).toBe("prepare_thank_you");
    expect(toolDefinitions(false, true).slice(0, -1)).toEqual(toolDefinitions(false));
  });
  it("is refused for a role that can't email donors, even when called anyway", () => {
    expect(checkToolCall("prepare_thank_you", good, false, false)).toMatchObject({ ok: false, error: expect.stringContaining("owner or admin") });
    expect(checkToolCall("prepare_thank_you", good, false, true)).toMatchObject({ ok: true, draft: { audience: "gave:this_month" } });
  });
  it("only ever runs through the preparer, never as a read-only lookup", async () => {
    const call = checkToolCall("prepare_thank_you", good, false, true);
    if (!call.ok) throw new Error("expected ok");
    await expect(runTool(call, {} as never, false)).rejects.toThrow(/runPrepare/);
    expect(await runPrepare(call, null)).toMatchObject({ isError: true, prepared: null });
    expect(await runPrepare(call, { prepare: async () => ({ refused: "Not live yet." }) })).toMatchObject({ isError: true, prepared: null, text: expect.stringContaining("Nothing was prepared") });
    const ok = await runPrepare(call, { prepare: async () => ({ count: 3, label: "Gave this month", draftId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) });
    expect(ok.prepared).toEqual({ draftId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", audience: "gave:this_month" });
    expect(JSON.parse(ok.text)).toMatchObject({ prepared: true, sent: false });
  });
  it("Givy is told it never sends, and a role without the tool is told to ask the owner or admin", () => {
    const text = stableInstructions({ whatsApp: null, email: null });
    expect(text).toContain("Never say or suggest that you sent anything");
    expect(askerContext("viewer", null, false)).toContain("ask their charity's owner or admin");
    expect(askerContext("admin", null, true)).not.toContain("can't email donors");
    expect(askerContext("demo", null)).toContain("isn't available on the demo");
  });
});

describe("the live preparer", () => {
  const make = (role: "owner" | "admin" | "fundraiser" | "finance" | "viewer", status = "approved") => livePreparer({ charityId: CHARITY, userId: "u1", role, status: async () => status });
  const d = { audience: "gave:this_month" as const, subject: "Thank you", body: "Thank you for your gift this month." };

  it("keeps the draft for this charity and person, for a few hours, works out the count on the server, and sends nothing", async () => {
    const now = Date.now();
    const r = await make("fundraiser").prepare(d);
    expect(r).toEqual({ count: 2, label: "Gave this month", draftId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    expect(sent.picked).toEqual([{ kind: "gave", period: "this_month" }]);
    const insert = db.calls.find((c) => c.table === "assistant_drafts" && c.op === "insert")!;
    const row = insert.payload as Record<string, string>;
    expect(row).toMatchObject({ charity_id: CHARITY, user_id: "u1", audience: "gave:this_month", subject: "Thank you" });
    const hours = (Date.parse(row.expires_at) - now) / 3_600_000;
    expect(hours).toBeGreaterThan(5.9);
    expect(hours).toBeLessThan(6.1);
    expect(sent.count).toBe(0);
  });
  it("refuses a role that can't email donors, and a page that isn't live, before anything is kept", async () => {
    expect(await make("viewer").prepare(d)).toMatchObject({ refused: expect.stringContaining("emailing donors") });
    expect(await make("finance").prepare(d)).toMatchObject({ refused: expect.any(String) });
    expect(await make("owner", "pending_review").prepare(d)).toMatchObject({ refused: expect.stringContaining("live") });
    expect(db.calls.filter((c) => c.op === "insert")).toEqual([]);
    expect(sent.picked).toEqual([]);
  });
  it("still prepares (with only the audience for the button) before the drafts table exists", async () => {
    db.insertError = { code: "PGRST205", message: "missing" };
    expect(await make("admin").prepare(d)).toMatchObject({ draftId: null, count: 2 });
  });
});

describe("reading a kept draft back", () => {
  it("only for this person on this charity, and only before it expires", async () => {
    db.selectResult = { data: { audience: "monthly", subject: "Thank you", body: "Thank you for every month.", expires_at: "x" }, error: null };
    const now = new Date("2026-11-24T10:00:00Z");
    expect(await loadDraft("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", CHARITY, "u1", now)).toEqual({ audience: "monthly", subject: "Thank you", body: "Thank you for every month." });
    const read = db.calls.find((c) => c.table === "assistant_drafts")!;
    expect(read.filters).toEqual({ "eq:id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "eq:charity_id": CHARITY, "eq:user_id": "u1", "gt:expires_at": now.toISOString() });
  });
  it("says it's gone for an unknown, expired or someone else's draft, or a bad id", async () => {
    db.selectResult = { data: null, error: null };
    expect(await loadDraft("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", CHARITY, "someone-else")).toBe("gone");
    expect(await loadDraft("not-an-id", CHARITY, "u1")).toBe("gone");
    expect(db.calls.filter((c) => c.table === "assistant_drafts")).toHaveLength(1);
  });
  it("is simply not there before the migration (no error)", async () => {
    db.selectResult = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    expect(await loadDraft("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", CHARITY, "u1")).toBeNull();
  });
  it("tidies the person's expired drafts when a new one is kept", async () => {
    const now = new Date("2026-11-24T10:00:00Z");
    await saveDraft({ charityId: CHARITY, userId: "u1", audience: "all", subject: "Thank you", body: "Thank you for giving." }, now);
    const tidy = db.calls.find((c) => c.table === "assistant_drafts" && c.op === "delete")!;
    expect(tidy.filters).toEqual({ "eq:charity_id": CHARITY, "eq:user_id": "u1", "lt:expires_at": now.toISOString() });
  });
});

describe("the thank-you in the app", () => {
  const args = { charityId: CHARITY, appealId: "ap1", subject: "Thank you", body: "Thank you for your gift." };
  it("is only for donor records linked to an app account, once per account", () => {
    expect(inAppRows(args, [{ id: "d1", user_id: null }, { id: "d2", user_id: "u2" }, { id: "d3", user_id: "u2" }, { id: "d4", user_id: "u4" }])).toEqual([
      { charity_id: CHARITY, user_id: "u2", donor_id: "d2", appeal_id: "ap1", subject: "Thank you", body: "Thank you for your gift." },
      { charity_id: CHARITY, user_id: "u4", donor_id: "d4", appeal_id: "ap1", subject: "Thank you", body: "Thank you for your gift." },
    ]);
  });
  it("is written by the server, for the donors whose email went, never twice", async () => {
    db.donors = [{ id: "d2", user_id: "u2" }];
    expect(await writeInAppMessages({ ...args, donorIds: ["d1", "d2"] })).toBe(1);
    const read = db.calls.find((c) => c.table === "donors")!;
    expect(read.filters).toMatchObject({ "in:id": ["d1", "d2"], "not:user_id:is": null });
    const up = db.calls.find((c) => c.table === "donor_messages")!;
    expect((up.payload as { o: unknown }).o).toEqual({ onConflict: "appeal_id,user_id", ignoreDuplicates: true });
  });
  it("writes nothing, and never fails, before the migration or when nobody uses the app", async () => {
    expect(await writeInAppMessages({ ...args, donorIds: [] })).toBe(0);
    db.donors = [{ id: "d1", user_id: null }];
    expect(await writeInAppMessages({ ...args, donorIds: ["d1"] })).toBe(0);
    db.donors = [{ id: "d2", user_id: "u2" }];
    db.upsertError = { code: "PGRST205", message: "missing" };
    expect(await writeInAppMessages({ ...args, donorIds: ["d2"] })).toBe(0);
    db.upsertError = { code: "500", message: "boom" };
    await expect(writeInAppMessages({ ...args, donorIds: ["d2"] })).resolves.toBe(0);
  });
  it("is only for an email marked for the app (a thank-you prepared with Givy)", () => {
    expect(showsInApp({ value: "gave:this_month", inApp: true })).toBe(true);
    expect(showsInApp({ value: "all" })).toBe(false);
    expect(showsInApp({ value: "all", inApp: "yes" })).toBe(false);
    expect(showsInApp(null)).toBe(false);
  });
});
