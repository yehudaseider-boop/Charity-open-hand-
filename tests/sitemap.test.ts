/** The site map lists the public pages and approved charities, and nothing else. */
import { describe, expect, it } from "vitest";
import { sitemapEntries } from "@/lib/seo/sitemap";

describe("the site map", () => {
  it("lists the fixed public pages and each charity's page", () => {
    const urls = sitemapEntries("https://givezy.test/", [{ slug: "meals-fund", updated_at: "2026-10-20T08:00:00Z" }]).map((e) => e.url);
    expect(urls).toEqual([
      "https://givezy.test/",
      "https://givezy.test/charities",
      "https://givezy.test/for-charities",
      "https://givezy.test/privacy",
      "https://givezy.test/terms",
      "https://givezy.test/c/meals-fund",
    ]);
  });

  it("keeps the date a charity last changed, and leaves out a slug that isn't a plain address", () => {
    const e = sitemapEntries("https://givezy.test", [{ slug: "a-b", updated_at: "2026-10-20T08:00:00Z" }, { slug: "x/../admin", updated_at: null }, { slug: "c", updated_at: null }]);
    expect(e.find((x) => x.url.endsWith("/c/a-b"))?.lastModified).toEqual(new Date("2026-10-20T08:00:00Z"));
    expect(e.map((x) => x.url)).not.toContain("https://givezy.test/c/x/../admin");
    expect(e.find((x) => x.url.endsWith("/c/c"))).not.toHaveProperty("lastModified");
  });
});
