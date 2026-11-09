import { beforeEach, describe, expect, it, vi } from "vitest";

// The phone's secure storage, as a plain map.
const store = new Map<string, string>();
vi.mock("../apps/mobile/src/lib/secure-storage", () => ({
  secureStorage: {
    getItem: async (k: string) => store.get(k) ?? null,
    getItemStrict: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));
const { loadOwned, saveOwned } = await import("../apps/mobile/src/lib/owned-storage");
const { loadDetails, saveDetails } = await import("../apps/mobile/src/lib/donor-details");

describe("personal records on a shared phone", () => {
  beforeEach(() => store.clear());

  it("each signed-in person has their own", async () => {
    await saveOwned("income", "ann", "[ann]");
    await saveOwned("income", "ben", "[ben]");
    expect(await loadOwned("income", "ann")).toBe("[ann]");
    expect(await loadOwned("income", "ben")).toBe("[ben]");
  });

  it("what was set up before signing in goes to the first person who signs in, and only to them", async () => {
    await saveOwned("income", null, "[before sign-in]");
    expect(await loadOwned("income", "ann")).toBe("[before sign-in]");
    expect(await loadOwned("income", "ben")).toBeNull();
    expect(await loadOwned("income", null)).toBeNull();
  });

  it("someone who already has their own never takes the shared copy", async () => {
    await saveOwned("income", "ann", "[ann]");
    await saveOwned("income", null, "[shared]");
    expect(await loadOwned("income", "ann")).toBe("[ann]");
    expect(await loadOwned("income", null)).toBe("[shared]");
  });

  it("name and email remembered while signed out are never handed to whoever signs in next", async () => {
    await saveDetails(null, { first_name: "Ann", last_name: "Smith", email: "ann@example.com", phone: "" });
    expect(await loadDetails("ben")).toBeNull();
    expect(await loadOwned("x", "ben", { adoptShared: false })).toBeNull();
    // Still there for signed-out use on this phone, and the key names are unchanged.
    expect(await loadDetails(null)).toMatchObject({ first_name: "Ann" });
    expect(store.has("nediv-lev.donor-details")).toBe(true);
    expect(store.has("nediv-lev.donor-details.u.ben")).toBe(false);
  });
});
