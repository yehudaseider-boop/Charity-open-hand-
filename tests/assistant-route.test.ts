import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  viewer: null as null | { userId: string },
  role: null as null | string,
  limited: false,
  streamText: ["Open ", "[Team](dash:/team)."],
  streamFails: false,
  stopReason: "end_turn",
  lastParams: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/auth", () => ({ getViewer: async () => state.viewer }));
vi.mock("@/lib/charity/team", () => ({ viewerRole: async () => state.role }));
vi.mock("@/lib/rate-limit", () => ({ hitRateLimit: async () => state.limited, ipKeys: (ip: string) => [`ip:${ip}`] }));
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
          return {
            async *[Symbol.asyncIterator]() {
              for (const t of state.streamText) yield { type: "content_block_delta", delta: { type: "text_delta", text: t } };
              if (state.streamFails) throw new APIError("boom");
            },
            finalMessage: async () => ({ stop_reason: state.stopReason, usage: { input_tokens: 1, output_tokens: 2 } }),
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
  Object.assign(state, { viewer: { userId: "u1" }, role: "admin", limited: false, streamText: ["Open ", "[Team](dash:/team)."], streamFails: false, stopReason: "end_turn", lastParams: null });
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
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
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
});
