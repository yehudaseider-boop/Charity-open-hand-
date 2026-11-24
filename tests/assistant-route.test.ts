import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  viewer: null as null | { userId: string },
  role: null as null | string,
  limited: false,
  streamText: ["Open ", "[Team](dash:/team)."],
  streamFails: false,
  stopReason: "end_turn",
  lastParams: null as null | Record<string, unknown>,
  allParams: [] as Record<string, unknown>[],
  secondStep: true,
  ipKnown: true,
  limitOptions: [] as unknown[],
  /** Rounds that ask for a lookup before the answer: each is the tool_use blocks of one round. */
  toolRounds: [] as { id: string; name: string; input: unknown }[][],
  looked: [] as string[],
  refuseBucket: "",
  forgotten: [] as string[],
  donors: [] as unknown[],
  audits: [] as Record<string, unknown>[],
  limitCalls: [] as { bucket: string; keys: string[]; limit: number; minutes: number }[],
}));
vi.mock("@/lib/audit", () => ({ logAudit: async (e: Record<string, unknown>) => void state.audits.push(e) }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mfa", () => ({ hasSecondStep: async () => state.secondStep }));
const fakeSource = () => ({
  totals: async () => { state.looked.push("totals"); return { label: "This month (November 2026)", gifts: 3, raisedCents: 125_000, donors: 2, s18aRequestedCents: 0, refunded: 0, refundedCents: 0, chargedBack: 0, pending: 0, failed: 0 }; },
  byMonth: async () => [], monthly: async () => ({ running: 0, perMonthCents: 0, retrying: 0, paused: 0, ended: 0, nextCharges: [] }),
  setup: async () => ({ status: "Approved", application: null, gettingStarted: [] }), receipts: async () => [],
  recentGifts: async () => [], donors: async () => { state.looked.push("donors"); return state.donors; },
  donorContact: async (donorId: string) => { state.looked.push(`contact:${donorId}`); return { email: "moshe@x.co", phone: "082 123 4567" }; },
});
vi.mock("@/lib/assistant/live-source", () => ({ liveSource: fakeSource }));
vi.mock("@/lib/assistant/demo-source", () => ({ demoSource: fakeSource }));

// Givy prepares thank-yous (24/11/2026): a stand-in preparer that records what it was given and for whom. Anything
// that would send is a trap: the route must never reach it.
const prep = vi.hoisted(() => ({ made: [] as { charityId: string; userId: string; role: string }[], prepared: [] as unknown[], draftId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" as string | null, sends: 0, charityName: null as string | null }));
vi.mock("@/lib/assistant/drafts", () => ({
  livePreparer: (a: { charityId: string; userId: string; role: string }) => {
    prep.made.push({ charityId: a.charityId, userId: a.userId, role: a.role });
    return {
      prepare: async (d: unknown) => (prep.prepared.push(d), { count: 42, label: "Gave this month", draftId: prep.draftId }),
      charityName: async () => prep.charityName,
    };
  },
}));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ name: "trap", send: async () => void prep.sends++ }) }));
vi.mock("@/lib/charity/appeals", () => ({
  sendAppeal: async () => void prep.sends++,
  createAppeal: async () => void prep.sends++,
  pickAudience: async () => null,
}));

vi.mock("@/lib/auth", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/charity/team", () => ({ viewerRole: async () => state.role }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (bucket: string, keys: string[], limit: number, minutes: number, options: { recorded?: string[] } = {}) => {
    state.limitCalls.push({ bucket, keys, limit, minutes });
    state.limitOptions.push(options);
    const refused = state.limited || state.refuseBucket === bucket;
    if (!refused) options.recorded?.push(`${bucket}-row`);
    return refused;
  },
  forgetAttempts: async (ids: string[]) => void state.forgotten.push(...ids),
  ipKeys: (ip: string) => (state.ipKnown ? [`ip:${ip}`] : []),
}));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          state.lastParams = params;
          state.allParams.push({ ...params, messages: [...(params.messages as unknown[])] });
          const round = state.toolRounds.shift();
          return {
            async *[Symbol.asyncIterator]() {
              if (round) return;
              for (const t of state.streamText) yield { type: "content_block_delta", delta: { type: "text_delta", text: t } };
              if (state.streamFails) throw new APIError("boom");
            },
            finalMessage: async () =>
              round
                ? { stop_reason: "tool_use", content: round.map((r) => ({ type: "tool_use", ...r })), usage: { input_tokens: 1, output_tokens: 2 } }
                : { stop_reason: state.stopReason, content: [], usage: { input_tokens: 1, output_tokens: 2 } },
            abort: () => {},
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

const { POST } = await import("@/app/api/assistant/route");

const id = "11111111-2222-3333-4444-555555555555";
const ask = (body: unknown, headers: Record<string, string> = { origin: "https://test.givezy.co.za", host: "test.givezy.co.za" }) =>
  POST(new Request("https://test.givezy.co.za/api/assistant", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const question = { charityId: id, page: `/charity-admin/${id}/team`, messages: [{ role: "user", content: "How do I add someone?" }] };

beforeEach(() => {
  vi.stubEnv("ASSISTANT", "yes");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ASSISTANT_DEMO", "");
  vi.stubEnv("ASSISTANT_DONOR_DATA", "");
  vi.stubEnv("ASSISTANT_CONTACT_DATA", "");
  state.donors = [];
  Object.assign(state, {
    viewer: { userId: "u1" }, role: "admin", limited: false, streamText: ["Open ", "[Team](dash:/team)."], streamFails: false, stopReason: "end_turn",
    lastParams: null, allParams: [], secondStep: true, ipKnown: true, limitOptions: [], toolRounds: [], looked: [], refuseBucket: "", forgotten: [],
    audits: [], limitCalls: [],
  });
});

describe("the help assistant's server", () => {
  it("is not there while switched off", async () => {
    vi.stubEnv("ASSISTANT", "");
    expect((await ask(question)).status).toBe(404);
  });

  it("refuses a request from another site", async () => {
    expect((await ask(question, { origin: "https://evil.example", host: "test.givezy.co.za" })).status).toBe(403);
  });

  it("needs a signed-in member of this charity", async () => {
    state.viewer = null;
    expect((await ask(question)).status).toBe(401);
    state.viewer = { userId: "u1" };
    state.role = null;
    expect((await ask(question)).status).toBe(403);
    expect(state.lastParams).toBeNull();
  });

  it("answers a member, streaming the words, with the guide cached and the person's role and page after it", async () => {
    const res = await ask(question);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Open [Team](dash:/team).\n[[thanks:]]\n[[next:]]");
    const p = state.lastParams!;
    const system = p.system as { text: string; cache_control?: unknown }[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(system[0].text).toContain("Givezy dashboard helper");
    expect(system[0].text).not.toContain(id);
    expect(system[1].text).toContain("Admin");
    expect(system[1].text).toContain("dash:/team");
    expect(p.messages).toEqual([{ role: "user", content: "How do I add someone?" }]);
  });

  it("says plainly when someone has asked too much", async () => {
    state.limited = true;
    const res = await ask(question);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { message: string }).message).toMatch(/try again a little later/);
    expect(state.lastParams).toBeNull();
  });

  it("marks an answer that broke off, so the panel can offer Try again", async () => {
    state.streamFails = true;
    expect(await (await ask(question)).text()).toBe("Open [Team](dash:/team).\n\n[[error]]");
  });

  it("says it can't help when the model declines", async () => {
    state.streamText = [];
    state.stopReason = "refusal";
    expect(await (await ask(question)).text()).toMatch(/can't help with that one/);
  });

  it("keeps the demo closed unless its own switch is on, and needs no sign-in when it is", async () => {
    state.viewer = null;
    const demo = { demo: true, messages: [{ role: "user", content: "Hi" }] };
    expect((await ask(demo)).status).toBe(404);
    vi.stubEnv("ASSISTANT_DEMO", "yes");
    const res = await ask(demo);
    expect(res.status).toBe(200);
    expect((state.lastParams!.system as { text: string }[])[1].text).toContain("public demo");
  });

  it("needs the second sign-in step, as the dashboard does (review 21/11/2026)", async () => {
    state.secondStep = false;
    const res = await ask(question);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message: string }).message).toMatch(/authenticator/);
    expect(state.lastParams).toBeNull();
  });

  it("refuses the demo when the visitor's address is unknown, and limits forget refused attempts", async () => {
    vi.stubEnv("ASSISTANT_DEMO", "yes");
    state.viewer = null;
    state.ipKnown = false;
    expect((await ask({ demo: true, messages: [{ role: "user", content: "Hi" }] })).status).toBe(429);
    expect(state.lastParams).toBeNull();
    state.ipKnown = true;
    await ask({ demo: true, messages: [{ role: "user", content: "Hi" }] });
    expect(state.limitOptions.every((o) => (o as { forgetRefused?: boolean }).forgetRefused === true)).toBe(true);
  });

  it("looks things up, sends the results back, then streams the answer (22/11/2026)", async () => {
    state.toolRounds = [[{ id: "t1", name: "giving_totals", input: { period: "this_month" } }]];
    state.streamText = ["R1 250 came in this month."];
    const res = await ask({ ...question, messages: [{ role: "user", content: "How much came in this month?" }] });
    // Last, which lookups ran, for the panel's follow-up questions (22/11/2026).
    expect(await res.text()).toBe("R1 250 came in this month.\n[[thanks:]]\n[[next:giving_totals]]");
    expect(state.looked).toEqual(["totals"]);
    expect(state.allParams).toHaveLength(2);
    const second = state.allParams[1].messages as { role: string; content: unknown }[];
    const result = (second[2].content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[])[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(result.is_error).toBeUndefined();
    expect(JSON.parse(result.content)).toMatchObject({ raised: "R1 250", gifts: 3 });
  });

  it("runs at most six lookups in one round; the rest are refused, not run (review 24/11/2026)", async () => {
    state.toolRounds = [Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: "giving_totals", input: { period: "this_month" } }))];
    state.streamText = ["Done."];
    await (await ask({ ...question, messages: [{ role: "user", content: "Check every period" }] })).text();
    expect(state.looked).toHaveLength(6);
    const results = (state.allParams[1].messages as { content: unknown }[])[2].content as { is_error?: boolean; content: string }[];
    expect(results).toHaveLength(30);
    expect(results.filter((r) => r.is_error)).toHaveLength(24);
    expect(results[29].content).toMatch(/Too many lookups/);
  });

  it("runs at most twelve lookups in one answer, over all its rounds (review 24/11/2026)", async () => {
    const round = (n: number) => Array.from({ length: 5 }, (_, i) => ({ id: `r${n}-${i}`, name: "giving_totals", input: { period: "this_month" } }));
    state.toolRounds = [round(1), round(2), round(3), round(4)];
    state.streamText = ["Done."];
    await (await ask({ ...question, messages: [{ role: "user", content: "Check everything" }] })).text();
    expect(state.looked).toHaveLength(12);
  });

  it("without the donor switch, offers no donor tools and refuses a donor lookup", async () => {
    state.toolRounds = [[{ id: "t1", name: "top_donors", input: { limit: 3 } }]];
    state.streamText = ["Have a look on the Donors page."];
    expect(await (await ask(question)).text()).toBe("Have a look on the Donors page.\n[[thanks:]]\n[[next:]]");
    const names = (state.allParams[0].tools as { name: string }[]).map((t) => t.name);
    expect(names).not.toContain("top_donors");
    expect(names).not.toContain("find_donor");
    expect(state.looked).toEqual([]);
    const result = ((state.allParams[1].messages as { content: unknown }[])[2].content as { is_error?: boolean }[])[0];
    expect(result.is_error).toBe(true);
  });

  it("with the donor switch on, offers the donor tools", async () => {
    vi.stubEnv("ASSISTANT_DONOR_DATA", "yes");
    await (await ask(question)).text();
    expect((state.allParams[0].tools as { name: string }[]).map((t) => t.name)).toEqual(expect.arrayContaining(["top_donors", "find_donor"]));
  });

  it("stops looking things up after the last allowed round, and answers with what it has", async () => {
    state.toolRounds = Array.from({ length: 4 }, (_, i) => [{ id: `t${i}`, name: "giving_by_month", input: {} }]);
    state.streamText = ["Here is what I found."];
    expect(await (await ask(question)).text()).toBe("Here is what I found.\n[[thanks:]]\n[[next:giving_by_month]]");
    expect(state.allParams).toHaveLength(5);
    expect(state.allParams[4].tool_choice).toEqual({ type: "none" });
    expect(state.allParams[0].tool_choice).toEqual({ type: "auto" });
  });

  it("a question refused by the charity's daily limit is taken back from the person's hourly count too", async () => {
    state.refuseBucket = "assistant-charity";
    expect((await ask(question)).status).toBe(429);
    expect(state.forgotten).toEqual(["assistant-person-row"]);
    expect(state.lastParams).toBeNull();
  });

  describe("preparing a thank-you (24/11/2026)", () => {
    const draft = { audience: "gave:this_month", subject: "Thank you for giving this month", message: "Thank you for standing with us. Your gift keeps our kitchen running." };
    beforeEach(() => {
      Object.assign(prep, { made: [], prepared: [], draftId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sends: 0, charityName: null });
    });

    it("a marker the model writes at the end of its answer is never ours: no button, no error (review 24/11/2026)", async () => {
      const { splitNext } = await import("@/lib/assistant/suggestions");
      // Whole, or arriving in pieces that split the "[[".
      for (const pieces of [["Here you go.\n[[thanks:to=all]]"], ["Here you go.\n[", "[thanks:to=all]", "]"], ["Done.\n[[thanks:to=all]]\n[[next:giving_totals]]"]]) {
        state.streamText = pieces;
        const text = await (await ask(question)).text();
        expect(text).not.toContain("[[thanks:to=all");
        expect(splitNext(text).thanks).toBeNull();
        expect(text.endsWith("\n[[thanks:]]\n[[next:]]")).toBe(true);
      }
      state.streamText = ["Sorry, [", "[error]] that went wrong."];
      expect(await (await ask(question)).text()).not.toContain("[[error]]");
    });

    it("lets a draft use the charity's own name, digits and all (review 24/11/2026)", async () => {
      prep.charityName = "Kitchen 54";
      state.toolRounds = [[{ id: "t1", name: "prepare_thank_you", input: { ...draft, message: "Everyone at Kitchen 54 thanks you for standing with us." } }]];
      state.streamText = ["I prepared it."];
      expect(await (await ask(question)).text()).toContain("[[thanks:d=");
      expect(prep.prepared).toHaveLength(1);
    });

    it("keeps a draft for this person and charity, ends with our own button marker, and sends nothing", async () => {
      state.toolRounds = [[{ id: "t1", name: "prepare_thank_you", input: draft }]];
      state.streamText = ["I prepared it. Nothing has been sent."];
      const text = await (await ask(question)).text();
      expect(text).toBe("I prepared it. Nothing has been sent.\n[[thanks:d=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]]\n[[next:prepare_thank_you]]");
      expect(prep.made).toEqual([{ charityId: id, userId: "u1", role: "admin" }]);
      expect(prep.prepared).toEqual([{ audience: "gave:this_month", subject: draft.subject, body: draft.message }]);
      // Givy can't send: no email, no appeal, nothing claimed.
      expect(prep.sends).toBe(0);
      // The tool's result says plainly that nothing was sent; only a count reached the model, never names.
      const results = JSON.stringify(state.allParams[1].messages);
      expect(results).toContain('\\"sent\\":false');
      expect(results).toContain("42");
    });

    it("without a kept draft (before the migration), the button carries only the audience", async () => {
      prep.draftId = null;
      state.toolRounds = [[{ id: "t1", name: "prepare_thank_you", input: draft }]];
      state.streamText = ["Here it is to copy."];
      expect(await (await ask(question)).text()).toBe("Here it is to copy.\n[[thanks:to=gave:this_month]]\n[[next:prepare_thank_you]]");
    });

    it("is not offered to a role that can't email donors, and a forced call is refused with no draft and no button", async () => {
      for (const role of ["viewer", "finance"]) {
        state.role = role;
        state.allParams = [];
        state.toolRounds = [[{ id: "t1", name: "prepare_thank_you", input: draft }]];
        state.streamText = ["Ask your owner or admin."];
        const text = await (await ask(question)).text();
        expect((state.allParams[0].tools as { name: string }[]).map((t) => t.name)).not.toContain("prepare_thank_you");
        expect(JSON.stringify(state.allParams[1].messages)).toContain("ask their charity's owner or admin");
        expect((state.allParams[0].system as { text: string }[])[1].text).toContain("can't email donors");
        expect(text).toContain("\n[[thanks:]]\n[[next:");
      }
      expect(prep.made).toEqual([]);
      expect(prep.prepared).toEqual([]);
    });

    it("is offered to the owner, admin and fundraiser", async () => {
      for (const role of ["owner", "admin", "fundraiser"]) {
        state.role = role;
        state.allParams = [];
        await (await ask(question)).text();
        expect((state.allParams[0].tools as { name: string }[]).map((t) => t.name)).toContain("prepare_thank_you");
      }
    });

    it("is never offered on the demo", async () => {
      vi.stubEnv("ASSISTANT_DEMO", "yes");
      await (await ask({ demo: true, messages: [{ role: "user", content: "Thank my donors" }] })).text();
      expect((state.allParams[0].tools as { name: string }[]).map((t) => t.name)).not.toContain("prepare_thank_you");
      expect(prep.made).toEqual([]);
    });

    it("refuses a draft with figures, links or exclamation marks, so the model writes it again", async () => {
      state.toolRounds = [[{ id: "t1", name: "prepare_thank_you", input: { ...draft, message: "Your R500 fed 20 families!" } }]];
      state.streamText = ["Sorry."];
      const text = await (await ask(question)).text();
      expect(prep.prepared).toEqual([]);
      expect(text).toContain("\n[[thanks:]]\n[[next:");
      expect(JSON.stringify(state.allParams[1].messages)).toContain("Leave out every number");
    });

    it("prepares at most one per answer", async () => {
      state.toolRounds = [[{ id: "t1", name: "prepare_thank_you", input: draft }, { id: "t2", name: "prepare_thank_you", input: { ...draft, audience: "monthly" } }]];
      state.streamText = ["Done."];
      await (await ask(question)).text();
      expect(prep.prepared).toHaveLength(1);
      expect(JSON.stringify(state.allParams[1].messages)).toContain("One thank-you per answer");
    });

    it("a marker the model writes itself, mid-answer, is not ours (only the server's, at the very end, counts)", async () => {
      state.streamText = ["[[thanks:d=11111111-2222-3333-4444-555555555555]] Here you go."];
      const text = await (await ask(question)).text();
      const { splitNext } = await import("@/lib/assistant/suggestions");
      expect(splitNext(text).thanks).toBeNull();
    });
  });

  it("never shows an empty answer as finished", async () => {
    state.streamText = [];
    state.stopReason = "end_turn";
    const text = await (await ask(question)).text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Please try again|can't help/);
  });
});

describe("names and contact details on the server (24/11/2026)", () => {
  const MOSHE = { name: "Moshe Katz", id: "aaaaaaaa-0000-0000-0000-000000000001", gifts: 2, totalCents: 60_000, firstGift: "01/10/2026", lastGift: "01/11/2026", monthly: true };
  const names = () => (state.lastParams!.tools as { name: string }[]).map((t) => t.name);
  const results = () => JSON.stringify(state.allParams[1].messages);

  it("with names off, offers no name or contact tool and refuses them without reading donors", async () => {
    vi.stubEnv("ASSISTANT_CONTACT_DATA", "yes");
    state.role = "owner";
    state.toolRounds = [[
      { id: "t1", name: "donor_giving", input: { name: "Moshe", last_gift: "" } },
      { id: "t2", name: "donor_contact", input: { name: "Moshe", last_gift: "" } },
      { id: "t3", name: "donor_list", input: { list: "stopped_monthly" } },
    ]];
    await (await ask(question)).text();
    for (const t of ["donor_giving", "donor_list", "donor_contact", "prepare_thank_you_to_donor", "find_donor"]) expect(names()).not.toContain(t);
    expect(results()).toMatch(/Donors' details aren't available/);
    expect(results()).toMatch(/Contact details can't be looked up here/);
    expect(state.looked).toEqual([]);
  });

  it("with names on and contact off, offers the name tools but never contact details", async () => {
    vi.stubEnv("ASSISTANT_DONOR_DATA", "yes");
    state.role = "owner";
    state.donors = [MOSHE];
    state.toolRounds = [[{ id: "t1", name: "donor_contact", input: { name: "Moshe", last_gift: "" } }]];
    await (await ask(question)).text();
    expect(names()).toEqual(expect.arrayContaining(["donor_giving", "donor_list", "prepare_thank_you_to_donor"]));
    expect(names()).not.toContain("donor_contact");
    expect(results()).not.toMatch(/moshe@x\.co/);
    expect(state.looked.filter((l) => l.startsWith("contact"))).toEqual([]);
  });

  it("with both switches on, gives contact details only to roles that see them, one donor per answer", async () => {
    vi.stubEnv("ASSISTANT_DONOR_DATA", "yes");
    vi.stubEnv("ASSISTANT_CONTACT_DATA", "yes");
    state.donors = [MOSHE];
    state.role = "viewer";
    state.toolRounds = [[{ id: "t1", name: "donor_contact", input: { name: "Moshe", last_gift: "" } }]];
    await (await ask(question)).text();
    expect(names()).not.toContain("donor_contact");
    expect(results()).not.toMatch(/moshe@x\.co/);
    expect((state.allParams[0].system as { text: string }[])[1].text).toMatch(/can't see donors' contact details/);

    state.role = "finance";
    state.allParams = [];
    state.looked = [];
    state.toolRounds = [[
      { id: "t1", name: "donor_contact", input: { name: "Moshe", last_gift: "" } },
      { id: "t2", name: "donor_contact", input: { name: "Moshe Katz", last_gift: "" } },
    ]];
    await (await ask(question)).text();
    expect(names()).toContain("donor_contact");
    expect(results()).toMatch(/moshe@x\.co/);
    expect(results()).toMatch(/One donor's contact details per answer/);
    expect(state.looked.filter((l) => l.startsWith("contact"))).toHaveLength(1);
  });

  it("has its own daily limit per person, and an audit row per lookup without the details themselves (review 24/11/2026)", async () => {
    vi.stubEnv("ASSISTANT_DONOR_DATA", "yes");
    vi.stubEnv("ASSISTANT_CONTACT_DATA", "yes");
    state.donors = [MOSHE];
    state.role = "owner";
    state.toolRounds = [[{ id: "t1", name: "donor_contact", input: { name: "Moshe", last_gift: "" } }]];
    await (await ask(question)).text();
    expect(state.limitCalls).toContainEqual({ bucket: "assistant-contact", keys: ["user#u1"], limit: 10, minutes: 24 * 60 });
    expect(state.audits).toEqual([{ actorUserId: "u1", action: "charity.assistant_contact_lookup", entityType: "donor", entityId: MOSHE.id, details: { charity_id: id } }]);
    expect(JSON.stringify(state.audits)).not.toMatch(/moshe@x\.co|082 123 4567/);

    // Over the limit: refused plainly, nothing read, no audit row.
    state.allParams = [];
    state.looked = [];
    state.audits = [];
    state.refuseBucket = "assistant-contact";
    state.toolRounds = [[{ id: "t1", name: "donor_contact", input: { name: "Moshe", last_gift: "" } }]];
    await (await ask(question)).text();
    expect(results()).toMatch(/can't look up more contact details until tomorrow/);
    expect(results()).not.toMatch(/moshe@x\.co/);
    expect(state.looked.filter((l) => l.startsWith("contact"))).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("takes an email or phone Givy gave earlier out of the history sent back to the model (review 24/11/2026)", async () => {
    vi.stubEnv("ASSISTANT_CONTACT_DATA", "");
    const history = {
      ...question,
      messages: [
        { role: "user", content: "What is Moshe's email?" },
        { role: "assistant", content: "Moshe Katz: moshe@x.co, phone 082 123 4567 (or +27 82 123 4567)." },
        { role: "user", content: "And how much did he give?" },
      ],
    };
    await (await ask(history)).text();
    const sent = JSON.stringify(state.allParams[0].messages);
    expect(sent).not.toMatch(/moshe@x\.co|082 123 4567|\+27 82/);
    expect(sent).toContain("[contact details removed]");
    expect(sent).toContain("What is Moshe's email?");
  });

  it("never offers contact details on the public demo", async () => {
    vi.stubEnv("ASSISTANT_DEMO", "yes");
    vi.stubEnv("ASSISTANT_DONOR_DATA", "yes");
    vi.stubEnv("ASSISTANT_CONTACT_DATA", "yes");
    await (await ask({ ...question, charityId: undefined, demo: true })).text();
    expect(names()).not.toContain("donor_contact");
    expect(names()).toContain("donor_giving");
  });
});
