import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { storageKey } from "@/lib/assistant/storage-key";

describe("Givy's demo and saved chats (review 24/11/2026)", () => {
  it("the demo's data source imports no database or live data", () => {
    const text = readFileSync("src/lib/assistant/demo-source.ts", "utf8");
    const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) expect(i).not.toMatch(/supabase|queries|service|admin/i);
    // From the live source it takes only the month-name helper, never a reader.
    const fromLive = /import\s*\{([^}]*)\}\s*from\s*["']\.\/live-source["']/.exec(text);
    if (fromLive) expect(fromLive[1].split(",").map((s) => s.trim())).toEqual(["monthName"]);
  });

  it("says a donor gives monthly only while a monthly donation is running (review 24/11/2026)", async () => {
    const { demoSource } = await import("@/lib/assistant/demo-source");
    const donors = await demoSource(new Date("2026-11-24T10:00:00+02:00")).donors();
    expect(donors.length).toBeGreaterThan(0);
    for (const d of donors) expect(d.monthly).toBe(d.monthlyState === "running");
  });

  it("a chat saved while Givy could see donors' names is kept apart from one made without", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(storageKey(id, false, "u1", true)).not.toBe(storageKey(id, false, "u1", false));
    expect(storageKey(id, false, "u1")).toBe(storageKey(id, false, "u1", false));
    expect(storageKey(undefined, true, undefined, true)).toBe("givezy.helper.demo");
  });
});
