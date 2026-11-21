import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DASHBOARD_GUIDE } from "@/lib/assistant/guide";
import { linkTarget, stableInstructions } from "@/lib/assistant/prompt";

describe("the dashboard guide the helper answers from", () => {
  it("has unique sections with something in each", () => {
    const ids = DASHBOARD_GUIDE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of DASHBOARD_GUIDE) expect(s.body.trim().length, s.id).toBeGreaterThan(40);
  });

  it("links only to dashboard pages that exist", () => {
    for (const s of DASHBOARD_GUIDE) {
      const target = linkTarget(s.path);
      if (!target) continue;
      const folder = join(process.cwd(), "src/app", s.path.replace(/^\//, ""));
      expect(existsSync(join(folder, "page.tsx")), `${s.id}: ${s.path}`).toBe(true);
    }
  });

  it("follows the house style: no em dashes, exclamation marks, dollars or fee numbers", () => {
    const all = DASHBOARD_GUIDE.map((s) => `${s.title}\n${s.body}`).join("\n");
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/!/);
    expect(all).not.toMatch(/\$/);
    expect(all).not.toMatch(/\d+(?:[.,]\d+)?\s?%/);
    expect(all).not.toMatch(/\b(maaser|chomesh|tzedakah|hebrew)\b/i);
  });

  it("puts nothing that changes per person or per day in the cached instructions", () => {
    const a = stableInstructions({ whatsApp: "078 616 0489", email: "hello@givezy.co.za" });
    const b = stableInstructions({ whatsApp: "078 616 0489", email: "hello@givezy.co.za" });
    expect(a).toBe(b);
    expect(a).not.toMatch(/\b20\d\d-\d\d-\d\dT/);
  });
});
