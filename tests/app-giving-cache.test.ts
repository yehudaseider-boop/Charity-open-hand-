import { beforeEach, describe, expect, it } from "vitest";
import { fail, keychain } from "./stubs/expo-secure-store";

const { cacheKey, forgetGivingCache, writeGivingCache } = await import("../apps/mobile/src/lib/giving-cache");
const { secureStorage } = await import("../apps/mobile/src/lib/secure-storage");

beforeEach(() => {
  keychain.clear();
  fail.writeAfter = Infinity;
  fail.writes = 0;
});

describe("the offline copy of someone's giving", () => {
  it("is saved under their own key", async () => {
    await writeGivingCache("ann", '{"gifts":[]}');
    expect(await secureStorage.getItem(cacheKey("ann"))).toBe('{"gifts":[]}');
  });

  it("is removed when they sign out", async () => {
    await writeGivingCache("ann", "x");
    await forgetGivingCache("ann");
    expect(await secureStorage.getItem(cacheKey("ann"))).toBeNull();
  });

  it("is removed when the session simply ended after the app was restarted (nobody to name)", async () => {
    await writeGivingCache("ann", "x");
    // A fresh start: the app no longer knows who it was, only the phone's note does.
    await forgetGivingCache(null);
    expect(await secureStorage.getItem(cacheKey("ann"))).toBeNull();
    expect([...keychain.keys()].filter((k) => k.includes("giving"))).toEqual([]);
  });

  it("only clears the person it was for, not someone else's separate copy", async () => {
    await writeGivingCache("ann", "ann's");
    await secureStorage.setItem(cacheKey("ben"), "ben's");
    await forgetGivingCache("ann");
    expect(await secureStorage.getItem(cacheKey("ben"))).toBe("ben's");
  });

  it("forgetting when nothing is stored is harmless", async () => {
    await expect(forgetGivingCache(null)).resolves.toBeUndefined();
  });
});
