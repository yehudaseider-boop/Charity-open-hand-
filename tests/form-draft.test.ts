/**
 * A kept form draft is forgotten once a gift is confirmed, so the next person at a shared computer
 * does not find the previous donor's details filled in.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { clearFormDraft } = await import("@/components/forms/use-form-draft");

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe("clearFormDraft", () => {
  it("forgets only that form's draft", () => {
    vi.stubGlobal("sessionStorage", sessionStorage);
    store.set("gz_draft:donate:meals-fund", JSON.stringify({ at: Date.now(), values: { email: "a@b.test" } }));
    store.set("gz_draft:donate:other", "{}");
    clearFormDraft("donate:meals-fund");
    expect(store.has("gz_draft:donate:meals-fund")).toBe(false);
    expect(store.has("gz_draft:donate:other")).toBe(true);
  });

  it("does nothing, quietly, when storage is blocked", () => {
    vi.stubGlobal("sessionStorage", { removeItem: () => { throw new Error("blocked"); } });
    expect(() => clearFormDraft("donate:meals-fund")).not.toThrow();
  });
});
