/**
 * The coming-soon page may be listed by search engines on the coming-soon address only (Yehuda, 23/11/2026): searching
 * "Givezy" should find givezy.co.za, never the test site.
 */
import { describe, expect, it } from "vitest";
import { comingSoonListable } from "@/lib/coming-soon";

describe("the coming-soon page in search results", () => {
  it("may be listed on givezy.co.za", () => {
    expect(comingSoonListable("givezy.co.za", "givezy.co.za")).toBe(true);
    expect(comingSoonListable("givezy.co.za:443", "givezy.co.za")).toBe(true);
  });
  it("stays hidden anywhere else, the test site included, and when no coming-soon address is set", () => {
    for (const host of ["test.givezy.co.za", "charity-open-hand.vercel.app", "localhost:3000", ""]) {
      expect(comingSoonListable(host, "givezy.co.za")).toBe(false);
    }
    expect(comingSoonListable("givezy.co.za", undefined)).toBe(false);
  });
});
