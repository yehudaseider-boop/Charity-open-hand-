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

  it("also fails an answer that starts but then stalls halfway", async () => {
    vi.useFakeTimers();
    const stallingBody = ((_: unknown, init: RequestInit = {}) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("[{"));
              init.signal?.addEventListener("abort", () => c.error(init.signal?.reason));
            },
          }),
        ),
      )) as typeof fetch;
    const p = timedFetch(20_000, stallingBody)("https://x.test");
    const seen = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(20_000);
    await seen;
    vi.useRealTimers();
  });

  it("keeps the status and headers of a normal answer", async () => {
    const base = (async () => new Response('{"a":1}', { status: 201, headers: { "content-type": "application/json" } })) as typeof fetch;
    const r = await timedFetch(1_000, base)("https://x.test");
    expect(r.status).toBe(201);
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(await r.json()).toEqual({ a: 1 });
  });
});
