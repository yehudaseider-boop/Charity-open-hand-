/** Timing notes on slow dashboard pages (23/11/2026): only a slow read is logged, with the page, the read and the time. */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { timed, SLOW_READ_MS } = await import("@/lib/timing");

afterEach(() => vi.useRealTimers());

describe("timed", () => {
  it("logs a slow read with its page and name, and passes the answer through", async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const slow = new Promise<string>((ok) => setTimeout(() => ok("rows"), SLOW_READ_MS + 50));
    const result = timed("donors", "loadDonors", slow);
    await vi.advanceTimersByTimeAsync(SLOW_READ_MS + 50);
    expect(await result).toBe("rows");
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toMatch(/^\[timing\] donors loadDonors \d+ ms$/);
    info.mockRestore();
  });
  it("says nothing about a quick read, and still passes a failure on", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await timed("donors", "listTags", Promise.resolve([1, 2]))).toEqual([1, 2]);
    await expect(timed("donors", "loadContacts", Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
