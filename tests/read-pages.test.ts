import { describe, expect, it } from "vitest";
import { PAGE, readAllPages } from "@/lib/charity/read-pages";

/** A pretend table of `total` rows (0, 1, 2, ...), read like the database's API, recording each request. */
function table(total: number, o: { count?: boolean; growBy?: number; failAt?: number } = {}) {
  let rows = total;
  let open = 0;
  const seen = { requests: [] as number[], mostAtOnce: 0 };
  const page = async (from: number, to: number, count: boolean) => {
    seen.requests.push(from);
    open++;
    seen.mostAtOnce = Math.max(seen.mostAtOnce, open);
    await new Promise((r) => setTimeout(r, 1));
    open--;
    if (from === o.failAt) return { data: null, error: { message: "timeout" } };
    const data = Array.from({ length: Math.max(0, Math.min(to, rows - 1) - from + 1) }, (_, i) => from + i);
    const reply = { data, error: null, count: count && o.count !== false ? rows : null };
    // Someone gives while we read: rows arrive after the first request counted them.
    if (count && o.growBy) rows += o.growBy;
    return reply;
  };
  return { page, seen };
}
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("reading every row, page by page", () => {
  it("reads 20 000 rows in order, at most four requests at a time", async () => {
    const { page, seen } = table(20_000);
    expect(await readAllPages(page)).toEqual(upTo(20_000));
    expect(seen.mostAtOnce).toBe(4);
    expect(seen.requests.length).toBe(21); // 20 pages, then one short page to be sure nothing came after
  });

  it("stops after one request when everything fits on the first page", async () => {
    const { page, seen } = table(300);
    expect(await readAllPages(page)).toEqual(upTo(300));
    expect(seen.requests).toEqual([0]);
    expect(await readAllPages(table(0).page)).toEqual([]);
  });

  it("reads exactly a whole number of pages without losing or repeating a row", async () => {
    expect(await readAllPages(table(PAGE).page)).toEqual(upTo(PAGE));
    expect(await readAllPages(table(3 * PAGE).page)).toEqual(upTo(3 * PAGE));
  });

  it("still reads everything one by one when no count comes back", async () => {
    const { page, seen } = table(2_500, { count: false });
    expect(await readAllPages(page)).toEqual(upTo(2_500));
    expect(seen.mostAtOnce).toBe(1);
  });

  it("keeps reading past the count when rows were added while reading", async () => {
    expect(await readAllPages(table(3 * PAGE, { growBy: 1_500 }).page)).toEqual(upTo(3 * PAGE + 1_500));
  });

  it("fails rather than return part of the rows when a request fails", async () => {
    await expect(readAllPages(table(5_000, { failAt: 3 * PAGE }).page)).rejects.toThrow("timeout");
  });
});

describe("looking up batches a few at a time", () => {
  it("keeps the batches' order and never runs more than four at once", async () => {
    const { inTurns } = await import("@/lib/charity/read-pages");
    let open = 0;
    let most = 0;
    const out = await inTurns(upTo(11), async (i) => {
      open++;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 11 - i));
      open--;
      return i * 10;
    });
    expect(out).toEqual(upTo(11).map((i) => i * 10));
    expect(most).toBe(4);
    expect(await inTurns([], async () => 1)).toEqual([]);
  });

  it("fails when one batch fails, rather than give part of the answer", async () => {
    const { inTurns } = await import("@/lib/charity/read-pages");
    await expect(inTurns(upTo(6), async (i) => { if (i === 4) throw new Error("timeout"); return i; })).rejects.toThrow("timeout");
  });
});
