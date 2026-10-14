import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone's secure storage as a map, with failures that can be switched on.
const store = new Map<string, string>();
const fail = { read: false, write: false };
vi.mock("../apps/mobile/src/lib/secure-storage", () => ({
  secureStorage: {
    getItem: async (k: string) => {
      if (fail.read) throw new Error("keychain unavailable");
      return store.get(k) ?? null;
    },
    getItemStrict: async (k: string) => {
      if (fail.read) throw new Error("keychain unavailable");
      return store.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (fail.write) throw new Error("keychain full");
      store.set(k, v);
    },
    removeItem: async (k: string) => void store.delete(k),
  },
}));
const { loadIncome, saveIncome, startNewIncomeLog } = await import("../apps/mobile/src/lib/income-store");
const { loadTarget, saveTarget, setAsideTarget } = await import("../apps/mobile/src/lib/targets");

const entry = { id: "a", date: "2026-10-01", cents: 500_000, note: "Salary" };
const target = { period: "month" as const, maaserCents: 50_000, chomeshCents: null };

beforeEach(() => {
  store.clear();
  fail.read = fail.write = false;
});

describe("income log storage", () => {
  it("an empty log is empty, not a failure", async () => {
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [] });
  });

  it("saves and reloads", async () => {
    expect(await saveIncome([entry], "ann")).toEqual({ ok: true });
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [entry] });
  });

  it("a failed read is a failure, never an empty log, and the stored entries survive", async () => {
    await saveIncome([entry], "ann");
    fail.read = true;
    expect(await loadIncome("ann")).toEqual({ ok: false, reason: "unreadable" });
    fail.read = false;
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [entry] });
  });

  it("a failed write is reported, and the old log is untouched", async () => {
    await saveIncome([entry], "ann");
    fail.write = true;
    expect(await saveIncome([entry, { ...entry, id: "b" }], "ann")).toEqual({ ok: false });
    fail.write = false;
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [entry] });
  });

  it("retrying the same entries after recovery saves them", async () => {
    fail.write = true;
    const entries = [entry];
    expect((await saveIncome(entries, "ann")).ok).toBe(false);
    fail.write = false;
    expect((await saveIncome(entries, "ann")).ok).toBe(true);
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [entry] });
  });

  it("unreadable stored text is reported as corrupt and left in place", async () => {
    store.set("nediv-lev.income-log.u.ann", "{not json");
    expect(await loadIncome("ann")).toEqual({ ok: false, reason: "corrupt" });
    store.set("nediv-lev.income-log.u.ann", '{"a":1}');
    expect(await loadIncome("ann")).toEqual({ ok: false, reason: "corrupt" });
    expect(store.get("nediv-lev.income-log.u.ann")).toBe('{"a":1}');
  });

  it("starting a new log keeps the old text aside first", async () => {
    store.set("nediv-lev.income-log.u.ann", "{not json");
    expect(await startNewIncomeLog("ann")).toEqual({ ok: true });
    expect(store.get("nediv-lev.income-log.set-aside.u.ann")).toBe("{not json");
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [] });
  });

  it("starting a new log replaces nothing if the old text can't be kept aside", async () => {
    store.set("nediv-lev.income-log.u.ann", "{not json");
    fail.write = true;
    expect(await startNewIncomeLog("ann")).toEqual({ ok: false });
    expect(store.get("nediv-lev.income-log.u.ann")).toBe("{not json");
  });

  it("two people on one phone keep separate logs, and a failed read for one doesn't touch the other", async () => {
    await saveIncome([entry], "ann");
    await saveIncome([{ ...entry, id: "b", cents: 1 }], "ben");
    expect(await loadIncome("ann")).toEqual({ ok: true, value: [entry] });
    expect(((await loadIncome("ben")) as { value: unknown[] }).value).toHaveLength(1);
    expect(await loadIncome("cara")).toEqual({ ok: true, value: [] });
  });
});

describe("target storage", () => {
  it("no target yet is not a failure", async () => {
    expect(await loadTarget("ann")).toEqual({ ok: true, value: null });
  });

  it("saves and reloads, per person", async () => {
    expect(await saveTarget(target, "ann")).toEqual({ ok: true });
    expect(await loadTarget("ann")).toEqual({ ok: true, value: target });
    expect(await loadTarget("ben")).toEqual({ ok: true, value: null });
  });

  it("a failed read is a failure and the saved target survives", async () => {
    await saveTarget(target, "ann");
    fail.read = true;
    expect(await loadTarget("ann")).toEqual({ ok: false, reason: "unreadable" });
    fail.read = false;
    expect(await loadTarget("ann")).toEqual({ ok: true, value: target });
  });

  it("a failed write is reported", async () => {
    fail.write = true;
    expect(await saveTarget(target, "ann")).toEqual({ ok: false });
  });

  it("an invalid stored target is corrupt; setting it aside keeps the text and allows a new one", async () => {
    store.set("nediv-lev.maaser-target.u.ann", '{"period":"week"}');
    expect(await loadTarget("ann")).toEqual({ ok: false, reason: "corrupt" });
    expect(await setAsideTarget("ann")).toEqual({ ok: true });
    expect(store.get("nediv-lev.maaser-target.set-aside.u.ann")).toBe('{"period":"week"}');
    expect(await loadTarget("ann")).toEqual({ ok: true, value: null });
    await saveTarget(target, "ann");
    expect(await loadTarget("ann")).toEqual({ ok: true, value: target });
  });
});
