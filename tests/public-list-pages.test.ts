/**
 * Long lists read in full, website links that are only web addresses, and donor names that keep their own
 * direction (code review, 23/11/2026).
 * - The public charities list (and its cause filter) and the site map read 1 000 rows at a time: the database
 *   answers at most 1 000 and drops the rest without an error, so charity 1 001 onwards was missing.
 * - A charity's website shows as a link only when it is an http:// or https:// address.
 * - Donor names on the dashboard sit in <bdi>, so a right-to-left name doesn't turn the line around it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A stand-in table of `n` approved charities that answers at most 1 000 rows a request, as the database does. */
function table(n: number, categoryOf: (i: number) => string) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(5, "0")}`, slug: `c-${String(i).padStart(5, "0")}`, name_en: `Charity ${String(i).padStart(5, "0")}`, updated_at: null, charity_categories: [{ category_id: categoryOf(i) }] }));
  const ranges: [number, number][] = [];
  const db = {
    from: () => ({
      select: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["eq", "like", "order"]) q[m] = () => q;
        q.range = (from: number, to: number) => {
          ranges.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
        };
        q.limit = (k: number) => Promise.resolve({ data: rows.slice(0, Math.min(k, 1000)), error: null });
        q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(ok);
        return q;
      },
    }),
  };
  return { db, ranges };
}

describe("the public charities list", () => {
  it("reads every approved charity, 1 000 at a time", async () => {
    const { readPublicCharities } = await import("@/lib/charity/public-list");
    const { db, ranges } = table(2500, () => "cat-a");
    const rows = await readPublicCharities(db as never, { pattern: null, categoryId: null });
    expect(rows).toHaveLength(2500);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("a cause with more than 1 000 charities lists them all, and only them", async () => {
    const { readPublicCharities } = await import("@/lib/charity/public-list");
    const { db } = table(3000, (i) => (i % 3 === 0 ? "cat-b" : "cat-a"));
    const rows = await readPublicCharities<{ id: string; charity_categories: { category_id: string }[] }>(db as never, { pattern: null, categoryId: "cat-a" });
    expect(rows).toHaveLength(2000);
    expect(rows.every((r) => r.charity_categories[0].category_id === "cat-a")).toBe(true);
  });

  it("the list page reads through it", () => {
    const view = readFileSync(new URL("../src/app/charities/view.tsx", import.meta.url), "utf8");
    expect(view).toContain("readPublicCharities");
    expect(view).not.toMatch(/\.in\("id"/);
  });
});

describe("the site map", () => {
  it("lists every approved charity, past the first 1 000", async () => {
    const { db, ranges } = table(2500, () => "cat-a");
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => db }));
    vi.doMock("@/lib/request-origin", () => ({ siteOrigin: () => "https://givezy.test" }));
    vi.doMock("@/lib/supabase/env", () => ({ supabaseUrl: () => "http://db.test", supabasePublishableKey: () => "key" }));
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    expect(entries.filter((e) => e.url.includes("/c/"))).toHaveLength(2500);
    expect(ranges.length).toBe(3);
  });
});

describe("a charity's website link", () => {
  it("is only ever an http:// or https:// address", async () => {
    const { webLink } = await import("@/lib/charity/web-link");
    expect(webLink("https://example.org.za/donate")).toBe("https://example.org.za/donate");
    expect(webLink("HTTP://example.org.za")).toBe("HTTP://example.org.za");
    for (const bad of ["javascript:alert(1)", "JavaScript://%0aalert(1)", "data:text/html,hi", "//evil.test", "example.org.za", "https://exa mple.org", "", null, undefined]) {
      expect(webLink(bad)).toBeNull();
    }
  });

  it("the public charity page links only through it", () => {
    const page = readFileSync(new URL("../src/app/c/[slug]/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("href={webLink(charity.website)!}");
    expect(page).not.toContain("href={charity.website}");
  });
});

describe("donor names on the dashboard", () => {
  const src = (p: string) => readFileSync(new URL(`../src/app/charity-admin/[id]/${p}`, import.meta.url), "utf8");

  it("keep their own direction wherever they are shown", () => {
    expect(src("donors/donor-peek.tsx")).toContain("<bdi>{children}</bdi>");
    expect(src("donors/[donorId]/page.tsx")).toContain("title={<bdi>{name}</bdi>}");
    expect(src("overview-view.tsx")).toContain("<bdi>{isErasedEmail(d.email) ? ERASED_DONOR : d.display_name}</bdi>");
    const recent = src("recent-donations.tsx");
    expect(recent.match(/<bdi>\{r\.donor\}<\/bdi>/g)).toHaveLength(2);
  });
});
