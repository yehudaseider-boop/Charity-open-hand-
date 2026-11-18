import { describe, expect, it, vi } from "vitest";
import { timedFetch } from "../apps/mobile/src/lib/timed-fetch";

/** A pretend network: answers after `ms`, or never; always gives up when asked to. */
const network = (ms: number | null) =>
  ((_: unknown, init: RequestInit = {}) =>
    new Promise<Response>((resolve, reject) => {
      const t = ms === null ? null : setTimeout(() => resolve(new Response("ok")), ms);
      init.signal?.addEventListener("abort", () => {
        if (t) clearTimeout(t);
        reject(init.signal?.reason ?? new Error("aborted"));
      });
    })) as typeof fetch;

describe("the database client's time limit (weak signal)", () => {
  it("lets a normal answer through", async () => {
    const r = await timedFetch(1_000, network(10))("https://x.test");
    expect(await r.text()).toBe("ok");
  });

  it("fails a stalled request after the limit, instead of waiting for ever", async () => {
    vi.useFakeTimers();
    const p = timedFetch(20_000, network(null))("https://x.test");
    // An "AbortError": the database library doesn't retry those, so one wait is the whole wait.
    const seen = expect(p).rejects.toMatchObject({ name: "AbortError", message: expect.stringMatching(/timed out/) });
    await vi.advanceTimersByTimeAsync(20_000);
    await seen;
    vi.useRealTimers();
  });

  it("still lets the caller cancel", async () => {
    const mine = new AbortController();
    const p = timedFetch(20_000, network(null))("https://x.test", { signal: mine.signal });
    mine.abort(new Error("cancelled by the screen"));
    await expect(p).rejects.toThrow(/cancelled by the screen/);
  });
});
