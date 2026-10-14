/**
 * The phone's secure storage layer itself (chunking, generations, missing pieces),
 * against a fake keychain. The other storage tests replace this layer entirely.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { fail, keychain } from "./stubs/expo-secure-store";

const { secureStorage, IncompleteValueError } = await import("../apps/mobile/src/lib/secure-storage");
const { loadOwned } = await import("../apps/mobile/src/lib/owned-storage");
const { loadIncome } = await import("../apps/mobile/src/lib/income-store");
const { loadTarget } = await import("../apps/mobile/src/lib/targets");

beforeEach(() => {
  keychain.clear();
  fail.writeAfter = Infinity;
  fail.writes = 0;
});

const big = JSON.stringify(Array.from({ length: 120 }, (_, i) => ({ id: `e${i}`, date: "2026-10-01", cents: 1000 + i, note: "x".repeat(40) })));

describe("secure storage", () => {
  it("stores a long value in pieces and reads it back whole", async () => {
    await secureStorage.setItem("k", big);
    expect(big.length).toBeGreaterThan(3600);
    expect([...keychain.keys()].filter((k) => k.startsWith("k.g")).length).toBeGreaterThan(2);
    expect(await secureStorage.getItem("k")).toBe(big);
    expect(await secureStorage.getItemStrict("k")).toBe(big);
  });

  it("keeps non-ASCII text intact", async () => {
    await secureStorage.setItem("k", JSON.stringify({ note: "שלום café" }));
    expect(JSON.parse((await secureStorage.getItem("k"))!)).toEqual({ note: "שלום café" });
  });

  it("nothing stored reads as null in both modes", async () => {
    expect(await secureStorage.getItem("none")).toBeNull();
    expect(await secureStorage.getItemStrict("none")).toBeNull();
  });

  it("a missing piece: the plain read says null, the strict read throws", async () => {
    await secureStorage.setItem("k", big);
    keychain.delete([...keychain.keys()].find((k) => k.startsWith("k.g1.1"))!);
    expect(await secureStorage.getItem("k")).toBeNull();
    await expect(secureStorage.getItemStrict("k")).rejects.toBeInstanceOf(IncompleteValueError);
  });

  it("a missing piece is reported as unreadable by the income log and targets, never as empty", async () => {
    await secureStorage.setItem("nediv-lev.income-log.u.ann", big);
    await secureStorage.setItem("nediv-lev.maaser-target.u.ann", big);
    for (const k of [...keychain.keys()].filter((k) => k.includes(".g1.1"))) keychain.delete(k);
    await expect(loadOwned("nediv-lev.income-log", "ann")).rejects.toBeInstanceOf(IncompleteValueError);
    expect(await loadIncome("ann")).toEqual({ ok: false, reason: "unreadable" });
    expect(await loadTarget("ann")).toEqual({ ok: false, reason: "unreadable" });
  });

  it("a write that fails part-way keeps the old value and removes the half-written pieces", async () => {
    await secureStorage.setItem("k", "old value");
    const before = new Set(keychain.keys());
    fail.writes = 0;
    fail.writeAfter = 2; // some pieces get written, then the keychain refuses
    await expect(secureStorage.setItem("k", big)).rejects.toThrow(/keychain full/);
    fail.writeAfter = Infinity;
    expect(await secureStorage.getItem("k")).toBe("old value");
    expect(new Set(keychain.keys())).toEqual(before);
  });

  it("replacing a value drops the old pieces", async () => {
    await secureStorage.setItem("k", big);
    await secureStorage.setItem("k", "short");
    expect([...keychain.keys()].sort()).toEqual(["k.g2.0", "k.n"]);
  });
});
