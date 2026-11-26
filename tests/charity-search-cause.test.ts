/**
 * Find a charity: a search that names a cause finds that cause's charities, as the search box promises ("Name, cause
 * or area"). QA 26/11/2026: "food" and "welfare" found nothing, though the charity is listed under "Food and welfare".
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rows = [
  { id: "1", name_en: "Soup Kitchen", search_text: "soup kitchen", charity_categories: [{ category_id: "food" }] },
  { id: "2", name_en: "Reading Trust", search_text: "reading trust soup", charity_categories: [{ category_id: "edu" }] },
  { id: "3", name_en: "Animal Rescue", search_text: "animal rescue", charity_categories: [{ category_id: "animals" }] },
];
/** A stand-in for the database: `like` on search_text with the website's %word% pattern. */
function db() {
  return {
    from: () => ({
      select: () => {
        let like: RegExp | null = null;
        const q: Record<string, unknown> = {};
        q.eq = () => q;
        q.order = () => q;
        q.like = (_c: string, pattern: string) => ((like = new RegExp(pattern.split("%").filter(Boolean).join(".*"))), q);
        q.range = () => Promise.resolve({ data: rows.filter((r) => !like || like.test(r.search_text)), error: null });
        return q;
      },
    }),
  };
}

describe("searching by cause", () => {
  it("a search naming a cause also lists that cause's charities, with the ones whose own text matches", async () => {
    const { readPublicCharities } = await import("@/lib/charity/public-list");
    const found = await readPublicCharities<(typeof rows)[number]>(db() as never, { pattern: "%soup%", categoryId: null, causeIds: ["animals"] });
    expect(found.map((r) => r.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("without a matching cause, only the text match counts, as before", async () => {
    const { readPublicCharities } = await import("@/lib/charity/public-list");
    const found = await readPublicCharities<(typeof rows)[number]>(db() as never, { pattern: "%animal%", categoryId: null });
    expect(found.map((r) => r.id)).toEqual(["3"]);
  });

  it("the cause's name is matched the way the search box matches words", async () => {
    const { matchesSearch } = await import("@/lib/charity/search-text");
    expect(matchesSearch("food", ["Food and welfare"])).toBe(true);
    expect(matchesSearch("welfare", ["Food and welfare"])).toBe(true);
    expect(matchesSearch("animals", ["Food and welfare"])).toBe(false);
  });
});
