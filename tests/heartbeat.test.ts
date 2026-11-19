/** The daily job's check-in (19/11/2026): off unless set, https only, sends nothing, never throws, never waits long. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { heartbeatAddress, pingHeartbeat, HEARTBEAT_TIME_LIMIT_MS } = await import("../src/lib/ops/heartbeat");

const ok = (async () => new Response("ok", { status: 200 })) as typeof fetch;

describe("the daily check-in address", () => {
  it("accepts a plain https address and nothing else", () => {
    expect(heartbeatAddress("https://uptime.example/api/heartbeat/abc123")).toBe("https://uptime.example/api/heartbeat/abc123");
    for (const v of [undefined, "", "   ", "http://uptime.example/x", "ftp://x.test/", "javascript:alert(1)", "not a url", "https://user:pw@uptime.example/x"]) {
      expect(heartbeatAddress(v)).toBeNull();
    }
  });
});

describe("making the check-in", () => {
  it("does nothing when no address is set", async () => {
    const base = vi.fn(ok);
    expect(await pingHeartbeat({}, base as unknown as typeof fetch)).toBe("skipped");
    expect(base).not.toHaveBeenCalled();
  });

  it("visits the address once with a plain GET and no body", async () => {
    const seen: [string, RequestInit | undefined][] = [];
    const base = (async (u: string | URL | Request, init?: RequestInit) => (seen.push([String(u), init]), new Response("ok"))) as typeof fetch;
    expect(await pingHeartbeat({ HEARTBEAT_DAILY_URL: "https://uptime.example/hb/x" }, base)).toBe("sent");
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe("https://uptime.example/hb/x");
    expect(seen[0][1]?.method).toBe("GET");
    expect(seen[0][1]?.body).toBeUndefined();
    expect(seen[0][1]?.redirect).toBe("error");
  });

  it("reports a refusal or a network failure as failed, never throws, and keeps the address out of the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = { HEARTBEAT_DAILY_URL: "https://uptime.example/hb/very-secret-token" };
    expect(await pingHeartbeat(env, (async () => new Response("no", { status: 500 })) as typeof fetch)).toBe("failed");
    expect(await pingHeartbeat(env, (async () => { throw new Error("connect failed https://uptime.example/hb/very-secret-token"); }) as typeof fetch)).toBe("failed");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("very-secret-token");
    warn.mockRestore();
  });

  it("gives up after a few seconds instead of holding the job up", async () => {
    vi.useFakeTimers();
    const stalls = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
    const p = pingHeartbeat({ HEARTBEAT_DAILY_URL: "https://uptime.example/hb/x" }, stalls);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_TIME_LIMIT_MS + 10);
    expect(await p).toBe("failed");
    vi.useRealTimers();
  });
});
