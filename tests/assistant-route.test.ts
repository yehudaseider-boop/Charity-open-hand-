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
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mfa", () => ({ hasSecondStep: async () => state.secondStep }));
const fakeSource = () => ({
  totals: async () => { state.looked.push("totals"); return { label: "This month (November 2026)", gifts: 3, raisedCents: 125_000, donors: 2, s18aRequestedCents: 0, refunded: 0, refundedCents: 0, chargedBack: 0, pending: 0, failed: 0 }; },
  byMonth: async () => [], monthly: async () => ({ running: 0, perMonthCents: 0, retrying: 0, paused: 0, ended: 0, nextCharges: [] }),
  setup: async () => ({ status: "Approved", application: null, gettingStarted: [] }), receipts: async () => [],
  recentGifts: async () => [], donors: async () => { state.looked.push("donors"); return []; },
});
vi.mock("@/lib/assistant/live-source", () => ({ liveSource: fakeSource }));
vi.mock("@/lib/assistant/demo-source", () => ({ demoSource: fakeSource }));

vi.mock("@/lib/auth", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/charity/team", () => ({ viewerRole: async () => state.role }));
vi.mock("@/lib/rate-limit", () => ({
  hitRateLimit: async (bucket: string, _k: string[], _l: number, _m: number, options: { recorded?: string[] }) => {
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
  Object.assign(state, {
    viewer: { userId: "u1" }, role: "admin", limited: false, streamText: ["Open ", "[Team](dash:/team)."], streamFails: false, stopReason: "end_turn",
    lastParams: null, allParams: [], secondStep: true, ipKnown: true, limitOptions: [], toolRounds: [], looked: [], refuseBucket: "", forgotten: [],
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
    expect(await res.text()).toBe("Open [Team](dash:/team).");
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
    expect(await res.text()).toBe("R1 250 came in this month.");
    expect(state.looked).toEqual(["totals"]);
    expect(state.allParams).toHaveLength(2);
    const second = state.allParams[1].messages as { role: string; content: unknown }[];
    const result = (second[2].content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[])[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(result.is_error).toBeUndefined();
    expect(JSON.parse(result.content)).toMatchObject({ raised: "R1 250", gifts: 3 });
  });

  it("without the donor switch, offers no donor tools and refuses a donor lookup", async () => {
    state.toolRounds = [[{ id: "t1", name: "top_donors", input: { limit: 3 } }]];
    state.streamText = ["Have a look on the Donors page."];
    expect(await (await ask(question)).text()).toBe("Have a look on the Donors page.");
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
    expect(await (await ask(question)).text()).toBe("Here is what I found.");
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

  it("never shows an empty answer as finished", async () => {
    state.streamText = [];
    state.stopReason = "end_turn";
    const text = await (await ask(question)).text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Please try again|can't help/);
  });
});
